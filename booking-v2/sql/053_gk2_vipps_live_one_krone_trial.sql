-- Isolated ONE-KRONE live Vipps QR verification. No Booking 2.0 writes.
-- At most two attempts per admin and three total per 24 hours.
CREATE TABLE IF NOT EXISTS gk2_private.vipps_live_qr_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email text NOT NULL,
  reference text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  capture_started_at timestamptz,
  capture_verified_at timestamptz,
  CONSTRAINT email_len CHECK (length(admin_email) BETWEEN 5 AND 254),
  CONSTRAINT ref_format CHECK (reference ~ '^GK2LQR-[A-Za-z0-9-]{12,56}$')
);
CREATE INDEX IF NOT EXISTS gk2_vipps_live_qr_rate_idx
  ON gk2_private.vipps_live_qr_attempts (admin_email,created_at DESC);
ALTER TABLE gk2_private.vipps_live_qr_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON gk2_private.vipps_live_qr_attempts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON gk2_private.vipps_live_qr_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.gk2_vipps_live_reserve(p_email text,p_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog','gk2_private'
AS $fn$
DECLARE v_email text := lower(btrim(p_email));
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF v_email IS NULL OR length(v_email) NOT BETWEEN 5 AND 254
    OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    OR p_reference IS NULL OR p_reference !~ '^GK2LQR-[A-Za-z0-9-]{12,56}$'
 THEN RETURN jsonb_build_object('ok',false,'code','invalid_request'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('gk2-live-qr-global',0));
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
$fn$;
REVOKE ALL ON FUNCTION public.gk2_vipps_live_reserve(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_vipps_live_reserve(text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.gk2_vipps_live_owned(p_email text,p_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog','gk2_private'
AS $fn$
DECLARE v_started timestamptz;v_verified timestamptz;
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT capture_started_at,capture_verified_at INTO v_started,v_verified
 FROM gk2_private.vipps_live_qr_attempts
 WHERE admin_email=lower(btrim(p_email)) AND reference=p_reference
   AND created_at>now()-interval '24 hours';
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false); END IF;
 RETURN jsonb_build_object('ok',true,'captureStarted',v_started IS NOT NULL,
   'captureVerified',v_verified IS NOT NULL);
END
$fn$;
REVOKE ALL ON FUNCTION public.gk2_vipps_live_owned(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_vipps_live_owned(text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.gk2_vipps_live_claim_capture(p_email text,p_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog','gk2_private'
AS $fn$
DECLARE v_ref text;
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 UPDATE gk2_private.vipps_live_qr_attempts
 SET capture_started_at=now()
 WHERE admin_email=lower(btrim(p_email)) AND reference=p_reference
   AND created_at>now()-interval '24 hours'
   AND capture_started_at IS NULL AND capture_verified_at IS NULL
 RETURNING reference INTO v_ref;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','already_started_or_not_owned'); END IF;
 RETURN jsonb_build_object('ok',true);
END
$fn$;
REVOKE ALL ON FUNCTION public.gk2_vipps_live_claim_capture(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_vipps_live_claim_capture(text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.gk2_vipps_live_mark_captured(p_email text,p_reference text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog','gk2_private'
AS $fn$
DECLARE v_ref text;
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 UPDATE gk2_private.vipps_live_qr_attempts SET capture_verified_at=now()
 WHERE admin_email=lower(btrim(p_email)) AND reference=p_reference
   AND capture_started_at IS NOT NULL AND capture_verified_at IS NULL
 RETURNING reference INTO v_ref;
 RETURN FOUND;
END
$fn$;
REVOKE ALL ON FUNCTION public.gk2_vipps_live_mark_captured(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_vipps_live_mark_captured(text,text) TO service_role;
