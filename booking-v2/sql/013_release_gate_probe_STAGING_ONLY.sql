-- Booking 2.0 staging: service-only atomic release gate read used by webhook.
BEGIN;
CREATE OR REPLACE FUNCTION public.gk2_release_gates_satisfied()
RETURNS boolean LANGUAGE plpgsql
SET search_path TO 'pg_catalog','gk2_private'
AS $function$
DECLARE ready boolean;
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden';END IF;
 SELECT coalesce(
 legacy_paid_orders_verified AND legacy_rules_verified
 AND customer_group_prices_verified AND checkout_paid_webhook_verified
 AND pushover_end_to_end_verified AND admin_auth_verified
 AND concurrency_verified AND legacy_cron_switch_verified,false)
 INTO ready
 FROM gk2_private.release_gates WHERE singleton=true;
 RETURN coalesce(ready,false);
END;
$function$;
REVOKE ALL ON FUNCTION public.gk2_release_gates_satisfied() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_release_gates_satisfied() TO service_role;
COMMIT;
