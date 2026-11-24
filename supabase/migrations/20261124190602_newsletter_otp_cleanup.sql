-- Expiration is checked in every transition; this job only removes stale rows.
create extension if not exists pg_cron;
select cron.schedule('newsletter-otp-cleanup', '*/15 * * * *', $job$
  delete from newsletter_private.challenges where expires_at <= (extract(epoch from clock_timestamp()) * 1000)::bigint;
  delete from newsletter_private.sessions where expires_at <= (extract(epoch from clock_timestamp()) * 1000)::bigint;
  delete from newsletter_private.delivery_limits where expires_at <= (extract(epoch from clock_timestamp()) * 1000)::bigint;
$job$);
