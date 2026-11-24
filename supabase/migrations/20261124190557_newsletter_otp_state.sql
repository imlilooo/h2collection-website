-- Only the trusted Netlify backend can execute transitions or access OTP state.
create schema newsletter_private;
revoke all on schema newsletter_private from public, anon, authenticated;
grant usage on schema newsletter_private to service_role;
create table newsletter_private.challenges (
  id uuid primary key,
  phone_hash text not null,
  binding text not null,
  code_hash text not null,
  status text not null check (status in ('sending','ready','failed','processing','uncertain','done')),
  expires_at bigint not null,
  next_send_at bigint not null,
  attempts integer not null default 0,
  fallback boolean not null default false
);
create table newsletter_private.sessions (
  phone_hash text primary key,
  challenge_id uuid not null,
  expires_at bigint not null
);
create table newsletter_private.delivery_limits (
  key text primary key,
  deliveries integer not null,
  expires_at bigint not null
);
create index challenges_expiry on newsletter_private.challenges(expires_at);
create index sessions_expiry on newsletter_private.sessions(expires_at);
create index delivery_limits_expiry on newsletter_private.delivery_limits(expires_at);
alter table newsletter_private.challenges enable row level security;
alter table newsletter_private.sessions enable row level security;
alter table newsletter_private.delivery_limits enable row level security;
revoke all on all tables in schema newsletter_private from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema newsletter_private to service_role;

create function public.newsletter_otp_transition(
  p_op text, p_now bigint, p_id uuid, p_phone text, p_ip text,
  p_binding text, p_digest text, p_fallback boolean, p_channel text
) returns text language plpgsql security invoker set search_path = '' as $$
declare
  c newsletter_private.challenges%rowtype;
  active newsletter_private.challenges%rowtype;
  active_id uuid;
  phone_key text := 'phone:' || p_phone;
  ip_key text := 'ip:' || p_ip;
  can_fallback boolean;
begin
  -- Consistent lock order serializes shared IDs, phone sessions and IP budgets.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('id:' || p_id::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(phone_key, 1));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(ip_key, 2));
  select * into c from newsletter_private.challenges where id = p_id and expires_at > p_now;
  select challenge_id into active_id from newsletter_private.sessions where phone_hash = p_phone and expires_at > p_now;
  select * into active from newsletter_private.challenges where id = active_id and expires_at > p_now;
  if p_op = 'reserve' then
    if c.id is not null and (c.binding <> p_binding or c.phone_hash <> p_phone) then return 'invalid'; end if;
    if active.id is not null then
      if active.status in ('processing','uncertain') then return 'busy'; end if;
      can_fallback := p_channel = 'sms' and active.id = p_id and active.fallback;
      if p_now < active.next_send_at and not can_fallback then return 'cooldown'; end if;
    end if;
    if p_channel not in ('whatsapp','sms') then return 'invalid'; end if;
    if p_channel = 'sms' and (active_id is distinct from p_id or c.binding is distinct from p_binding) then return 'invalid'; end if;
    if exists (select 1 from newsletter_private.delivery_limits where expires_at > p_now and
      ((key = phone_key and deliveries >= 5) or (key = ip_key and deliveries >= 20))) then return 'limit'; end if;
    insert into newsletter_private.delivery_limits as limits (key, deliveries, expires_at)
      values (phone_key, 1, p_now + 3600000), (ip_key, 1, p_now + 3600000)
      on conflict (key) do update set
        deliveries = case when limits.expires_at <= p_now then 1 else limits.deliveries + 1 end,
        expires_at = case when limits.expires_at <= p_now then excluded.expires_at else limits.expires_at end;
    if active_id is not null and active_id <> p_id then delete from newsletter_private.challenges where id = active_id; end if;
    insert into newsletter_private.challenges(id, phone_hash, binding, code_hash, status, expires_at, next_send_at)
      values(p_id, p_phone, p_binding, p_digest, 'sending', p_now + 300000, p_now + 60000)
      on conflict (id) do update set phone_hash = excluded.phone_hash, binding = excluded.binding,
        code_hash = excluded.code_hash, status = 'sending', expires_at = excluded.expires_at,
        next_send_at = excluded.next_send_at, attempts = 0, fallback = false;
    insert into newsletter_private.sessions(phone_hash, challenge_id, expires_at)
      values(p_phone, p_id, p_now + 300000)
      on conflict (phone_hash) do update set challenge_id = excluded.challenge_id, expires_at = excluded.expires_at;
    return 'ok';
  end if;
  if active_id is distinct from p_id or c.id is null then return 'expired'; end if;
  if c.binding <> p_binding or c.phone_hash <> p_phone then return 'invalid'; end if;
  if p_op in ('sent','sendFailed') then
    if c.code_hash <> p_digest or c.status <> 'sending' then return 'invalid'; end if;
    update newsletter_private.challenges set status = case when p_op = 'sent' then 'ready' else 'failed' end,
      fallback = p_fallback where id = p_id;
    return 'ok';
  end if;
  if p_op = 'verify' then
    if c.attempts >= 5 then return 'attempts'; end if;
    if c.code_hash <> p_digest then
      update newsletter_private.challenges set attempts = attempts + 1 where id = p_id;
      return 'wrong';
    end if;
    if c.status = 'done' then return 'done'; end if;
    if c.status <> 'ready' then return 'busy'; end if;
    update newsletter_private.challenges set status = 'processing' where id = p_id;
    return 'ok';
  end if;
  if p_op in ('done','retry','uncertain') then
    if c.status <> 'processing' then return 'invalid'; end if;
    update newsletter_private.challenges set status = case when p_op = 'retry' then 'ready' else p_op end where id = p_id;
    return 'ok';
  end if;
  return 'invalid';
end;
$$;
revoke all on function public.newsletter_otp_transition(text,bigint,uuid,text,text,text,text,boolean,text) from public, anon, authenticated;
grant execute on function public.newsletter_otp_transition(text,bigint,uuid,text,text,text,text,boolean,text) to service_role;
