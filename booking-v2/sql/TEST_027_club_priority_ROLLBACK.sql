BEGIN;
UPDATE gk2_private.release_gates SET legacy_paid_orders_verified=true,legacy_rules_verified=true,
 customer_group_prices_verified=true,checkout_paid_webhook_verified=true,pushover_end_to_end_verified=true,
 admin_auth_verified=true,concurrency_verified=true,legacy_cron_switch_verified=true;
SET LOCAL ROLE service_role;
DO $test$
DECLARE d date; t timestamptz; a jsonb; r text; n int:=0; v_old timestamptz;
BEGIN
 -- Europe/Oslo cutoff at exactly 00:01, including winter/summer and year boundary.
 FOREACH d IN ARRAY ARRAY[date '2026-11-05',date '2027-01-07',date '2027-04-01'] LOOP
  t:=((d-2)+time '00:01') AT TIME ZONE 'Europe/Oslo';
  IF NOT gk2_private.club_priority_blocked(d,t) THEN RAISE EXCEPTION 'unknown status released'; END IF;
  INSERT INTO gk2_private.club_capacity VALUES(d,10,1,t-interval '1 second');
  IF NOT gk2_private.club_priority_blocked(d,t-interval '1 second') THEN RAISE EXCEPTION 'released early'; END IF;
  IF gk2_private.club_priority_blocked(d,t) THEN RAISE EXCEPTION 'not released at cutoff'; END IF;
  UPDATE gk2_private.club_capacity SET remaining=9 WHERE slot_date=d;
  IF NOT gk2_private.club_priority_blocked(d,t) THEN RAISE EXCEPTION 'one signup ignored'; END IF;
  UPDATE gk2_private.club_capacity SET remaining=10,checked_at=t-interval '61 seconds' WHERE slot_date=d;
  IF NOT gk2_private.club_priority_blocked(d,t) THEN RAISE EXCEPTION 'stale empty observation released'; END IF;
  n:=n+5;
 END LOOP;
 IF gk2_private.club_priority_blocked('2026-11-06') THEN RAISE EXCEPTION 'other weekday blocked'; END IF;
 -- Live RPCs agree: future Thursday club priority; HYZR and exact 19:00 boundary remain usable.
 a:=public.gk2_day_availability('2026-11-05');
 IF (SELECT count(*) FROM jsonb_array_elements(a->'blocks') b WHERE b->>'target' IN ('dart_a','dart_b') AND (b->>'start_min')::int=1140 AND (b->>'end_min')::int=1320)<>2 THEN RAISE EXCEPTION 'missing calendar club blocks'; END IF;
 FOREACH r IN ARRAY ARRAY['dart_a','dart_b','venue'] LOOP
  BEGIN
   PERFORM public.gk2_hold_slot(gen_random_uuid(),'2026-11-05',r,CASE WHEN r='venue' THEN 960 ELSE 1140 END,CASE WHEN r='venue' THEN 240 ELSE 60 END,'gk-v1');
   RAISE EXCEPTION 'club hold accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'club_priority' THEN RAISE; END IF; END;
 END LOOP;
 PERFORM public.gk2_hold_slot(gen_random_uuid(),'2026-11-05','hyzr',1140,60,'gk-v1');
 PERFORM public.gk2_hold_slot(gen_random_uuid(),'2026-11-05','dart_a',1080,60,'gk-v1');
 -- Out-of-order observations cannot overwrite newer state.
 PERFORM public.gk2_record_club_capacity('2026-11-12',9,12,clock_timestamp()-interval '1 second');
 SELECT checked_at INTO v_old FROM gk2_private.club_capacity WHERE slot_date='2026-11-12';
 PERFORM public.gk2_record_club_capacity('2026-11-12',10,12,v_old-interval '1 second');
 IF (SELECT remaining FROM gk2_private.club_capacity WHERE slot_date='2026-11-12')<>9 THEN RAISE EXCEPTION 'old empty state overwrote signup'; END IF;
 RAISE NOTICE 'PASS: % cutoff assertions, live calendar, all 3 resource holds, HYZR, boundary and ordering',n;
END; $test$;
ROLLBACK;
