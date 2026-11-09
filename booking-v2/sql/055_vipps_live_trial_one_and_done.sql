-- Disable creation of any additional real 1-NOK test payments after successful capture.
-- Keeps read-only /status and /latest accessible so receipts can still be verified.
CREATE OR REPLACE FUNCTION public.gk2_vipps_live_reserve(p_email text, p_reference text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE v_email text := lower(btrim(p_email));
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF v_email IS NULL OR length(v_email) NOT BETWEEN 5 AND 254
    OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    OR p_reference IS NULL OR p_reference !~ '^GK2LQR-[A-Za-z0-9-]{12,56}$'
 THEN RETURN jsonb_build_object('ok',false,'code','invalid_request'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('gk2-live-qr-global',0));
 IF EXISTS(SELECT 1 FROM gk2_private.vipps_live_qr_attempts WHERE capture_verified_at IS NOT NULL)
 THEN RETURN jsonb_build_object('ok',false,'code','trial_already_completed'); END IF;
 IF (SELECT count(*) FROM gk2_private.vipps_live_qr_attempts
     WHERE created_at>now()-interval '24 hours')>=3
 THEN RETURN jsonb_build_object('ok',false,'code','daily_global_limit'); END IF;
 IF (SELECT count(*) FROM gk2_private.vipps_live_qr_attempts
     WHERE admin_email=v_email AND created_at>now()-interval '24 hours')>=2
 THEN RETURN jsonb_build_object('ok',false,'code','daily_admin_limit'); END IF;
 INSERT INTO gk2_private.vipps_live_qr_attempts(admin_email,reference)
 VALUES(v_email,p_reference);
 RETURN jsonb_build_object('ok',true,'reference',p_reference);
END
$function$
;
