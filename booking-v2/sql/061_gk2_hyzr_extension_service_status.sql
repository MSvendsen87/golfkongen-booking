-- Service-only internal status lookup. Never expose raw reservation/email or
-- customer data through an anonymous endpoint.
CREATE OR REPLACE FUNCTION public.gk2_hyzr_extension_get(p_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog','gk2_private'
AS $fn$
DECLARE h gk2_private.hyzr_extension_holds%ROWTYPE;
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden';END IF;
 IF p_reference IS NULL OR p_reference !~ '^GK2EXT-[a-f0-9-]{36}$'
 THEN RETURN jsonb_build_object('ok',false,'code','invalid_reference');END IF;
 SELECT * INTO h FROM gk2_private.hyzr_extension_holds WHERE reference=p_reference;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','extension_not_found');END IF;
 RETURN jsonb_build_object(
   'ok',true,'reference',h.reference,'holdId',h.id,
   'reservationId',h.reservation_id,'slotDate',h.slot_date,
   'minutes',h.minutes,'fromMin',h.from_min,'untilMin',h.until_min,
   'amountOre',h.amount_ore,'state',h.state,
   'expiresAt',h.expires_at,
   'captureStarted',h.capture_started_at IS NOT NULL,
   'captured',h.captured_at IS NOT NULL,
   'committed',h.committed_at IS NOT NULL
 );
END
$fn$;
REVOKE ALL ON FUNCTION public.gk2_hyzr_extension_get(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_hyzr_extension_get(text) TO service_role;
