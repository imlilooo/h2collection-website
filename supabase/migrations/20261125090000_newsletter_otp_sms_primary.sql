-- Allow SMS as the first delivery channel (WHATSAPP_ENABLED=false).
-- Same function as 20261124190557, minus the rule that SMS may only follow an existing challenge.
-- Binding, cooldown, fallback and delivery-limit checks are unchanged; the handler still
-- requires an existing challenge for SMS when WhatsApp is the primary channel.
create or replace function public.newsletter_otp_transition(
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
