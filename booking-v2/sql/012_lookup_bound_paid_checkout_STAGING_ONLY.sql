-- Staging-only: exact order->hold lookup for signed Quickbutik webhook.
-- This is not exposed to anon/authenticated and does not change reservations.
BEGIN;
CREATE OR REPLACE FUNCTION public.gk2_get_bound_checkout(p_order text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE result jsonb;
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_order IS NULL OR p_order !~ '^[1-9][0-9]{0,8}$'
 THEN RAISE EXCEPTION 'invalid_order_number'; END IF;
 SELECT jsonb_build_object(
  'id',r.id,'quickbutik_order_id',r.quickbutik_order_id,
  'status',r.status,'slot_date',r.slot_date,
  'resource',r.resource,'start_min',r.start_min,'end_min',r.end_min,
  'hold_expires_at',r.hold_expires_at,
  'customer_email',r.customer_email,'terms_version',r.terms_version,
  'terms_accepted_at',r.terms_accepted_at,'quoted_ore',r.quoted_ore,
  'rental_sets_count',r.rental_sets_count,'checkout_product_id',plan.quickbutik_product_id
 ) INTO result
 FROM gk2_private.reservations r
 JOIN gk2_private.checkout_product_plans plan
   ON plan.resource=r.resource AND plan.duration_minutes=r.end_min-r.start_min
 WHERE r.quickbutik_order_id=p_order
 LIMIT 1;
 RETURN result;
END;
$function$;
REVOKE ALL ON FUNCTION public.gk2_get_bound_checkout(text)
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_get_bound_checkout(text) TO service_role;
COMMIT;
