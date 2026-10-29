DO $do$
DECLARE v_command text;
BEGIN
 SELECT replace(command,'/functions/v1/gk2-notifier-cron','/functions/v1/gk2-rolling-calendar') INTO v_command
 FROM cron.job WHERE jobname='gk2-notifier-retry-every-minute' AND active;
 IF v_command IS NULL THEN RAISE EXCEPTION 'signed_dispatch_source_missing'; END IF;
 PERFORM cron.schedule('gk2-rolling-calendar-every-15-minutes','*/15 * * * *',v_command);
END $do$;
