-- Limit attempts to capture one HYZR extension to 4 overall, spaced 16s.
-- Vipps ePayment rate limits are 5 capture calls/minute/reference.
-- Clients may still poll GET for captured status without issuing a new capture.
ALTER TABLE gk2_private.hyzr_extension_holds
 ADD COLUMN IF NOT EXISTS capture_attempted_at timestamptz;
ALTER TABLE gk2_private.hyzr_extension_holds
 ADD COLUMN IF NOT EXISTS capture_attempt_count integer NOT NULL DEFAULT 0
 CONSTRAINT gk2_extension_capture_attempt_nonnegative CHECK(capture_attempt_count>=0);
CREATE OR REPLACE FUNCTION public.gk2_hyzr_extension_capture_gate(p_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog','gk2_private'
AS $fn$
DECLARE h gk2_private.hyzr_extension_holds%ROWTYPE;
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden';END IF;
 IF p_reference IS NULL OR p_reference !~ '^GK2EXT-[a-f0-9-]{36}$'
 THEN RETURN jsonb_build_object('ok',false,'code','invalid_reference');END IF;
 SELECT * INTO h FROM gk2_private.hyzr_extension_holds
 WHERE reference=p_reference FOR UPDATE;
 IF NOT FOUND OR h.state<>'capture_started'
 THEN RETURN jsonb_build_object('ok',false,'code','capture_not_started');END IF;
 IF h.capture_attempt_count>=4
 THEN RETURN jsonb_build_object('ok',false,'code','capture_retry_limit_manual_review');END IF;
 IF h.capture_attempted_at IS NOT NULL AND h.capture_attempted_at>now()-interval '16 seconds'
 THEN RETURN jsonb_build_object('ok',false,'code','capture_retry_wait');END IF;
 UPDATE gk2_private.hyzr_extension_holds
 SET capture_attempted_at=now(),capture_attempt_count=capture_attempt_count+1,
     updated_at=now() WHERE id=h.id;
 RETURN jsonb_build_object('ok',true,'attempt',h.capture_attempt_count+1);
END
$fn$;
REVOKE ALL ON FUNCTION public.gk2_hyzr_extension_capture_gate(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_hyzr_extension_capture_gate(text) TO service_role;