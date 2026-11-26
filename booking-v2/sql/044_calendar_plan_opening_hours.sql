CREATE OR REPLACE FUNCTION public.gk2_take_calendar_sync()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
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
 'openingHoursByWeekday',(
   SELECT jsonb_object_agg(h.weekday,jsonb_build_object('from',h.opens_min,'to',h.closes_min))
   FROM gk2_private.opening_hours h
   WHERE h.resource=p.resource AND h.active
 ),

 'bookableThrough',(now() AT TIME ZONE 'Europe/Oslo')::date+s.horizon_days,
 'targetDay',(now() AT TIME ZONE 'Europe/Oslo')::date+s.horizon_days+3)
 INTO result FROM gk2_private.checkout_product_plans p
 CROSS JOIN gk2_private.booking_settings s
 WHERE p.quickbutik_product_id=v_product AND s.singleton;
 RETURN result;
END $function$
;
