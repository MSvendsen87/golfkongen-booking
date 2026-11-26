BEGIN;
CREATE TABLE gk2_private.calendar_sync_state (
 product_id integer PRIMARY KEY CHECK(product_id BETWEEN 1474 AND 1506),
 last_attempt_at timestamptz,
 lease_token uuid,
 lease_until timestamptz,
 verified_at timestamptz,
 verified_through date,
 last_result jsonb
);
ALTER TABLE gk2_private.calendar_sync_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON gk2_private.calendar_sync_state FROM PUBLIC,anon,authenticated;
GRANT SELECT,UPDATE ON gk2_private.calendar_sync_state TO service_role;
INSERT INTO gk2_private.calendar_sync_state(product_id)
 SELECT quickbutik_product_id FROM gk2_private.checkout_product_plans;

CREATE FUNCTION public.gk2_take_calendar_sync() RETURNS jsonb
LANGUAGE plpgsql SET search_path TO 'pg_catalog','gk2_private' AS $f$
DECLARE v_product integer; v_token uuid:=gen_random_uuid(); result jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT product_id INTO v_product FROM gk2_private.calendar_sync_state
 WHERE lease_until IS NULL OR lease_until<now()
 ORDER BY last_attempt_at NULLS FIRST,product_id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF v_product IS NULL THEN RETURN NULL; END IF;
 UPDATE gk2_private.calendar_sync_state SET lease_token=v_token,
 lease_until=now()+interval '5 minutes',last_attempt_at=now() WHERE product_id=v_product;
 SELECT jsonb_build_object('productId',p.quickbutik_product_id,'resource',p.resource,
 'minutes',p.duration_minutes,'token',v_token,
 'firstDay',greatest(s.first_bookable_date,(now() AT TIME ZONE 'Europe/Oslo')::date),
 'bookableThrough',(now() AT TIME ZONE 'Europe/Oslo')::date+s.horizon_days,
 'targetDay',(now() AT TIME ZONE 'Europe/Oslo')::date+s.horizon_days+3)
 INTO result FROM gk2_private.checkout_product_plans p
 CROSS JOIN gk2_private.booking_settings s
 WHERE p.quickbutik_product_id=v_product AND s.singleton;
 RETURN result;
END $f$;
CREATE FUNCTION public.gk2_finish_calendar_sync(p_product integer,p_token uuid,p_result jsonb)
RETURNS boolean LANGUAGE plpgsql SET search_path TO 'pg_catalog','gk2_private' AS $f$
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_result IS NULL OR jsonb_typeof(p_result)<>'object' THEN RAISE EXCEPTION 'invalid_result'; END IF;
 UPDATE gk2_private.calendar_sync_state SET lease_token=NULL,lease_until=NULL,
 last_result=p_result,
 verified_at=CASE WHEN p_result->>'complete'='true' THEN now() ELSE verified_at END,
 verified_through=CASE WHEN p_result->>'complete'='true' THEN (p_result->>'targetDay')::date ELSE verified_through END
 WHERE product_id=p_product AND lease_token=p_token AND lease_until>now();
 RETURN FOUND;
END $f$;
REVOKE ALL ON FUNCTION public.gk2_take_calendar_sync() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.gk2_finish_calendar_sync(integer,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_take_calendar_sync() TO service_role;
GRANT EXECUTE ON FUNCTION public.gk2_finish_calendar_sync(integer,uuid,jsonb) TO service_role;
COMMIT;
