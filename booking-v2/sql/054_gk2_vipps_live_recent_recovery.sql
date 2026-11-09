-- Recover an already-created 1 NOK LIVE Vipps trial after the browser tab closes.
-- Service-role only; returns only the reference owned by the authenticated admin.
CREATE OR REPLACE FUNCTION public.gk2_vipps_live_recent(p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog','gk2_private'
AS $fn$
DECLARE r record;
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT reference,created_at,capture_started_at,capture_verified_at
 INTO r FROM gk2_private.vipps_live_qr_attempts
 WHERE admin_email=lower(btrim(p_email)) AND created_at>now()-interval '24 hours'
 ORDER BY created_at DESC LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','no_recent_test'); END IF;
 RETURN jsonb_build_object('ok',true,'reference',r.reference,
     'captureStarted',r.capture_started_at IS NOT NULL,
     'captureVerified',r.capture_verified_at IS NOT NULL);
END
$fn$;
REVOKE ALL ON FUNCTION public.gk2_vipps_live_recent(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_vipps_live_recent(text) TO service_role;