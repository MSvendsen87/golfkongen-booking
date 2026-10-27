BEGIN;
CREATE TABLE IF NOT EXISTS gk2_private.owner_email_tests (
 test_key text PRIMARY KEY CHECK(test_key='booking2-resend-owner-20261027'),
 status text NOT NULL CHECK(status IN ('claimed','sent','rejected','unknown')),
 provider_id text,
 created_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz
);
ALTER TABLE gk2_private.owner_email_tests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON gk2_private.owner_email_tests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON gk2_private.owner_email_tests TO service_role;
CREATE OR REPLACE FUNCTION public.gk2_claim_owner_email_test(p_key text)
RETURNS boolean LANGUAGE plpgsql SET search_path TO pg_catalog,gk2_private AS $f$
DECLARE inserted text;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_key IS DISTINCT FROM 'booking2-resend-owner-20261027' THEN RAISE EXCEPTION 'bad_key'; END IF;
 INSERT INTO gk2_private.owner_email_tests(test_key,status)
 VALUES(p_key,'claimed') ON CONFLICT DO NOTHING RETURNING test_key INTO inserted;
 RETURN inserted IS NOT NULL;
END;$f$;
CREATE OR REPLACE FUNCTION public.gk2_finish_owner_email_test(p_key text,p_status text,p_id text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SET search_path TO pg_catalog,gk2_private AS $f$
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_key IS DISTINCT FROM 'booking2-resend-owner-20261027' OR p_status NOT IN ('sent','rejected','unknown')
 THEN RAISE EXCEPTION 'bad_test_completion'; END IF;
 UPDATE gk2_private.owner_email_tests SET status=p_status,provider_id=left(p_id,100),finished_at=now()
 WHERE test_key=p_key AND status='claimed';
 RETURN FOUND;
END;$f$;
REVOKE ALL ON FUNCTION public.gk2_claim_owner_email_test(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.gk2_finish_owner_email_test(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_claim_owner_email_test(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gk2_finish_owner_email_test(text,text,text) TO service_role;
COMMIT;