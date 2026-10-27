-- Booking 2.0 shared club-vs-dart lock and availability, staging snapshot 2026-10-27.
-- Requires prior 026,027,028a,b,c. Replaces old Tuesday club-priority behavior.
-- Never disable any release gate via this migration.
CREATE OR REPLACE FUNCTION public.gk2_day_availability(p_day date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE v_claims jsonb;v_blocks jsonb;v_hours jsonb;v_enabled boolean;
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden';END IF;
 IF p_day IS NULL OR p_day < ((now() AT TIME ZONE 'Europe/Oslo')::date-1) OR p_day > (now() AT TIME ZONE 'Europe/Oslo')::date+(SELECT horizon_days FROM gk2_private.booking_settings WHERE singleton) THEN RAISE EXCEPTION 'date out of range';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('resource',c.physical_resource,'slot_min',c.slot_min)), '[]'::jsonb)
 INTO v_claims FROM gk2_private.claims c JOIN gk2_private.reservations r ON r.id=c.reservation_id
 WHERE c.slot_date=p_day AND (r.status='confirmed' OR (r.status IN ('held','payment_pending') AND (r.hold_expires_at>now() OR EXISTS (SELECT 1 FROM gk2_private.checkout_variant_leases l WHERE l.reservation_id=r.id AND l.status<>'closed'))));
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',b.id,'target',b.target,'start_min',b.start_min,'end_min',b.end_min,'label',b.label)), '[]'::jsonb)
 INTO v_blocks FROM gk2_private.blocks b WHERE b.active AND p_day BETWEEN b.date_from AND b.date_to
 AND (b.weekdays IS NULL OR array_length(b.weekdays,1) IS NULL OR extract(isodow from p_day)::int=ANY(b.weekdays));
 SELECT coalesce(jsonb_object_agg(h.resource,jsonb_build_object('from',h.opens_min,'to',h.closes_min)), '{}'::jsonb)
 INTO v_hours FROM gk2_private.opening_hours h WHERE h.weekday=extract(isodow from p_day)::int AND h.active;
 SELECT (legacy_paid_orders_verified AND legacy_rules_verified AND customer_group_prices_verified
  AND checkout_paid_webhook_verified AND pushover_end_to_end_verified AND admin_auth_verified
  AND concurrency_verified AND legacy_cron_switch_verified) INTO v_enabled
 FROM gk2_private.release_gates WHERE singleton;
 IF EXISTS (SELECT 1 FROM gk2_private.club_enrolments ce WHERE ce.slot_date=p_day AND (ce.status='confirmed' OR (ce.status IN ('held','payment_pending') AND ce.hold_expires_at>now()))) THEN
  v_blocks:=v_blocks||jsonb_build_array(
   jsonb_build_object('target','dart_a','start_min',1140,'end_min',1320),
   jsonb_build_object('target','dart_b','start_min',1140,'end_min',1320));
 END IF;
 RETURN jsonb_build_object('day',p_day,'claims',v_claims,'blocks',v_blocks,'openingHoursByResource',v_hours,
  'bookingEnabled',coalesce(v_enabled,false));
END;$function$;

CREATE OR REPLACE FUNCTION public.gk2_hold_slot(p_key uuid, p_day date, p_resource text, p_start integer, p_duration integer, p_terms text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE v_id uuid;v_end integer;v_exp timestamptz:=now()+interval '10 minutes';
 v_existing gk2_private.reservations%ROWTYPE;v_resources text[];v_code text;v_slot integer;
 v_weekday integer;v_today date;v_mins integer;
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden';END IF;
 IF NOT EXISTS(SELECT 1 FROM gk2_private.release_gates WHERE singleton
    AND legacy_paid_orders_verified AND legacy_rules_verified AND customer_group_prices_verified
    AND checkout_paid_webhook_verified AND pushover_end_to_end_verified
    AND admin_auth_verified AND concurrency_verified AND legacy_cron_switch_verified)
 THEN RAISE EXCEPTION 'gk2_launch_locked';END IF;
 IF p_key IS NULL OR p_day IS NULL OR p_resource IS NULL OR p_resource NOT IN ('hyzr','dart_a','dart_b','venue')
   OR p_start IS NULL OR p_duration IS NULL OR p_terms IS NULL OR p_terms NOT LIKE 'gk-v%' THEN RAISE EXCEPTION 'bad_request'; END IF;
 IF p_day < (SELECT first_bookable_date FROM gk2_private.booking_settings WHERE singleton) THEN RAISE EXCEPTION 'first_bookable_date_2026_11_01';END IF;
 v_end:=p_start+p_duration;
 IF p_duration%30<>0 OR p_start%30<>0 OR p_start<0 OR v_end>1440 OR
  (p_resource='venue' AND (p_duration<240 OR p_duration>720 OR p_duration%60<>0)) OR
  (p_resource<>'venue' AND (p_duration<30 OR p_duration>240))
 THEN RAISE EXCEPTION 'invalid_duration';END IF;
 v_today:=(now() AT TIME ZONE 'Europe/Oslo')::date;
 v_mins:=extract(hour from now() AT TIME ZONE 'Europe/Oslo')::int*60+
         extract(minute from now() AT TIME ZONE 'Europe/Oslo')::int;
 IF p_day<v_today OR p_day>v_today+(SELECT horizon_days FROM gk2_private.booking_settings WHERE singleton) OR (p_day=v_today AND p_start<v_mins+20) THEN RAISE EXCEPTION 'out_of_window';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_day::text,0));
 SELECT * INTO v_existing FROM gk2_private.reservations WHERE idempotency_key=p_key FOR UPDATE;
 IF FOUND THEN
  IF v_existing.slot_date<>p_day OR v_existing.resource<>p_resource OR v_existing.start_min<>p_start OR v_existing.end_min<>v_end
  THEN RAISE EXCEPTION 'key_reuse';END IF;
  RETURN jsonb_build_object('id',v_existing.id,'status',v_existing.status,'hold_expires_at',v_existing.hold_expires_at);
 END IF;
 DELETE FROM gk2_private.claims c USING gk2_private.reservations b
 WHERE c.reservation_id=b.id AND b.slot_date=p_day AND b.status IN ('held','payment_pending') AND b.hold_expires_at<now()
 AND NOT EXISTS (SELECT 1 FROM gk2_private.checkout_variant_leases l
  WHERE l.reservation_id=b.id AND l.status<>'closed');
 UPDATE gk2_private.reservations AS r SET status='expired',updated_at=now()
 WHERE r.slot_date=p_day AND r.status IN ('held','payment_pending') AND r.hold_expires_at<now()
 AND NOT EXISTS (SELECT 1 FROM gk2_private.checkout_variant_leases l
  WHERE l.reservation_id=r.id AND l.status<>'closed');
 v_weekday:=extract(isodow from p_day)::int;
 v_resources:=CASE WHEN p_resource='venue' THEN ARRAY['hyzr','dart_a','dart_b']::text[] ELSE ARRAY[p_resource]::text[] END;
 IF EXISTS (SELECT 1 FROM unnest(array_append(v_resources,p_resource)) AS r(x)
   LEFT JOIN gk2_private.opening_hours h ON h.resource=r.x AND h.weekday=v_weekday
   WHERE h.resource IS NULL OR h.active=false OR p_start<h.opens_min OR v_end>h.closes_min)
 THEN RAISE EXCEPTION 'closed_hours';END IF;
 IF EXISTS(SELECT 1 FROM gk2_private.blocks bl WHERE bl.active AND p_day BETWEEN bl.date_from AND bl.date_to
  AND (bl.weekdays IS NULL OR array_length(bl.weekdays,1) IS NULL OR v_weekday=ANY(bl.weekdays))
  AND p_start<bl.end_min AND v_end>bl.start_min
  AND (bl.target='all' OR (bl.target='venue_only' AND p_resource='venue')
       OR bl.target=ANY(v_resources))) THEN RAISE EXCEPTION 'blocked_time';END IF;
 IF p_resource IN ('dart_a','dart_b','venue') AND p_start<1320 AND v_end>1140
 AND EXISTS (SELECT 1 FROM gk2_private.club_enrolments ce WHERE ce.slot_date=p_day AND (ce.status='confirmed' OR (ce.status IN ('held','payment_pending') AND ce.hold_expires_at>now()))) THEN RAISE EXCEPTION 'club_already_reserved'; END IF;
 INSERT INTO gk2_private.reservations(idempotency_key,slot_date,resource,start_min,end_min,status,hold_expires_at,terms_version)
 VALUES(p_key,p_day,p_resource,p_start,v_end,'held',v_exp,p_terms) RETURNING id INTO v_id;
 FOREACH v_code IN ARRAY v_resources LOOP
  FOR v_slot IN SELECT generate_series(p_start,v_end-30,30) LOOP
   INSERT INTO gk2_private.claims(physical_resource,slot_date,slot_min,reservation_id)
   VALUES(v_code,p_day,v_slot,v_id);
  END LOOP;
 END LOOP;
 RETURN jsonb_build_object('id',v_id,'status','held','hold_expires_at',v_exp);
END; $function$;

REVOKE ALL ON FUNCTION public.gk2_day_availability(date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_day_availability(date) TO service_role;
REVOKE ALL ON FUNCTION public.gk2_hold_slot(uuid,date,text,integer,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_hold_slot(uuid,date,text,integer,integer,text) TO service_role;
