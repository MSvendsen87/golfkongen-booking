-- One explicitly authorized recipient-only Pushover integration test.
-- Immutable at-most-once claim prevents duplicated group alerts on retries.
BEGIN;
CREATE TABLE IF NOT EXISTS gk2_private.pushover_test_runs (
 id text PRIMARY KEY CHECK (id='owner-only-2026-10-27'),
 state text NOT NULL CHECK (state IN ('claimed','accepted','rejected','unknown')),
 provider_receipt text,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE gk2_private.pushover_test_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON gk2_private.pushover_test_runs FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON gk2_private.pushover_test_runs TO service_role;
CREATE OR REPLACE FUNCTION public.gk2_claim_owner_pushover_test(p_id text)
RETURNS boolean LANGUAGE plpgsql
SET search_path TO 'pg_catalog','gk2_private' AS $f$
DECLARE v text;
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_id IS DISTINCT FROM 'owner-only-2026-10-27' THEN RAISE EXCEPTION 'bad_test_id'; END IF;
 INSERT INTO gk2_private.pushover_test_runs(id,state)
 VALUES(p_id,'claimed') ON CONFLICT DO NOTHING RETURNING id INTO v;
 RETURN v IS NOT NULL;
END;$f$;
CREATE OR REPLACE FUNCTION public.gk2_finish_owner_pushover_test(
 p_id text,p_state text,p_receipt text DEFAULT NULL,p_error text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql
SET search_path TO 'pg_catalog','gk2_private' AS $f$
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_id IS DISTINCT FROM 'owner-only-2026-10-27' OR
 p_state NOT IN ('accepted','rejected','unknown') THEN RAISE EXCEPTION 'bad_test_completion'; END IF;
 UPDATE gk2_private.pushover_test_runs
 SET state=p_state,provider_receipt=left(p_receipt,160),
 last_error=left(p_error,120),updated_at=now()
 WHERE id=p_id AND state='claimed';
 RETURN FOUND;
END;$f$;
REVOKE ALL ON FUNCTION public.gk2_claim_owner_pushover_test(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.gk2_finish_owner_pushover_test(text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_claim_owner_pushover_test(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gk2_finish_owner_pushover_test(text,text,text,text) TO service_role;
COMMIT;