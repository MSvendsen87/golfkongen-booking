-- One nightly pass: 33 invocations, one per Booking 2.0 product.
-- 03:00-03:32 UTC = 04:00-04:32 CET / 05:00-05:32 CEST.
-- Only missing variants are added; cancellation/expiry cleanup stays every minute.
DO $do$
DECLARE v_command text;
BEGIN
 SELECT replace(command,'/functions/v1/gk2-notifier-cron','/functions/v1/gk2-rolling-calendar') INTO v_command
 FROM cron.job WHERE jobname='gk2-notifier-retry-every-minute' AND active;
 IF v_command IS NULL THEN RAISE EXCEPTION 'signed_dispatch_source_missing'; END IF;
 IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='gk2-rolling-calendar-every-15-minutes') THEN
  PERFORM cron.unschedule('gk2-rolling-calendar-every-15-minutes');
 END IF;
 PERFORM cron.schedule('gk2-rolling-calendar-nightly','0-32 3 * * *',v_command);
END $do$;
