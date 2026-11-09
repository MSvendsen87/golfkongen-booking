-- Vipps TEST QR only. Never touches bookings, paid amounts or capacity.
-- The service_role-only RPC enforces at most 3 requests/admin/hour.
CREATE TABLE IF NOT EXISTS gk2_private.vipps_qr_test_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email text NOT NULL,
  reference text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_email CHECK (length(admin_email) BETWEEN 5 AND 254),
  CONSTRAINT valid_ref CHECK (reference ~ '^GK2TQR-[a-zA-Z0-9-]{12,56}$')
);
CREATE INDEX IF NOT EXISTS gk2_vipps_qr_test_rate_idx
  ON gk2_private.vipps_qr_test_attempts (admin_email,created_at DESC);
ALTER TABLE gk2_private.vipps_qr_test_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON gk2_private.vipps_qr_test_attempts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON gk2_private.vipps_qr_test_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.gk2_vipps_test_reserve(p_email text,p_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog','gk2_private'
AS $fn$
DECLARE v_email text := lower(btrim(p_email));
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF v_email IS NULL OR length(v_email) NOT BETWEEN 5 AND 254
    OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    OR p_reference IS NULL OR p_reference !~ '^GK2TQR-[a-zA-Z0-9-]{12,56}$'
 THEN RETURN jsonb_build_object('ok',false,'code','invalid_test_request'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('gk2-vipps-test-qr:'||v_email,0));
 IF (SELECT count(*) FROM gk2_private.vipps_qr_test_attempts
     WHERE admin_email=v_email AND created_at>now()-interval '1 hour')>=3
 THEN RETURN jsonb_build_object('ok',false,'code','hourly_limit_reached'); END IF;
 INSERT INTO gk2_private.vipps_qr_test_attempts(admin_email,reference)
 VALUES(v_email,p_reference);
 RETURN jsonb_build_object('ok',true,'reference',p_reference);
END
$fn$;
REVOKE ALL ON FUNCTION public.gk2_vipps_test_reserve(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_vipps_test_reserve(text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.gk2_vipps_test_owned(p_email text,p_reference text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog','gk2_private'
AS $fn$
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 RETURN EXISTS(
  SELECT 1 FROM gk2_private.vipps_qr_test_attempts
  WHERE admin_email=lower(btrim(p_email))
    AND reference=p_reference
    AND created_at>now()-interval '24 hours'
 );
END
$fn$;
REVOKE ALL ON FUNCTION public.gk2_vipps_test_owned(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_vipps_test_owned(text,text) TO service_role;
