BEGIN;
UPDATE gk2_private.booking_settings SET club_enabled=true;
SET LOCAL ROLE service_role;
UPDATE gk2_private.club_checkout_variants SET enabled=true;
INSERT INTO gk2_private.club_access_stage(customer_id,active) VALUES('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true) ON CONFLICT(customer_id) DO UPDATE SET active=true;
DO $tests$
DECLARE d date; res text; h jsonb; c jsonb; rid uuid; cid uuid; thrown boolean;
BEGIN
 SELECT slot_date INTO d FROM gk2_private.club_checkout_variants v WHERE slot_date>(now() AT TIME ZONE 'Europe/Oslo')::date+7
 AND NOT EXISTS(SELECT 1 FROM gk2_private.reservations r WHERE r.slot_date=v.slot_date)
 AND NOT EXISTS(SELECT 1 FROM gk2_private.club_enrolments ce WHERE ce.slot_date=v.slot_date)
 ORDER BY slot_date LIMIT 1;
 IF d IS NULL THEN RAISE EXCEPTION 'no_empty_test_date'; END IF;
 FOREACH res IN ARRAY ARRAY['hyzr','dart_a','dart_b','venue'] LOOP
  h:=public.gk2_hold_slot(gen_random_uuid(),d,res,1080,CASE WHEN res='venue' THEN 240 ELSE 120 END,'gk-v1');
  rid:=(h->>'id')::uuid; thrown:=false;
  BEGIN
   PERFORM public.gk2_hold_club_seats(gen_random_uuid(),d,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',1);
  EXCEPTION WHEN others THEN
   IF SQLERRM='dart_already_reserved' THEN thrown:=true; ELSE RAISE; END IF;
  END;
  IF NOT thrown THEN RAISE EXCEPTION 'normal_did_not_block_club_%',res; END IF;
  IF (public.gk2_club_day_status(d)->>'canBook')::boolean THEN RAISE EXCEPTION 'availability_wrong_%',res; END IF;
  UPDATE gk2_private.reservations SET status='cancelled' WHERE id=rid;
  DELETE FROM gk2_private.claims WHERE reservation_id=rid;
 END LOOP;
 c:=public.gk2_hold_club_seats(gen_random_uuid(),d,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',1);
 cid:=(c->>'id')::uuid;
 FOREACH res IN ARRAY ARRAY['hyzr','dart_a','dart_b','venue'] LOOP
  thrown:=false;
  BEGIN
   PERFORM public.gk2_hold_slot(gen_random_uuid(),d,res,1140,CASE WHEN res='venue' THEN 240 ELSE 30 END,'gk-v1');
  EXCEPTION WHEN others THEN
   IF SQLERRM IN ('club_already_reserved','closed_hours') THEN thrown:=true; ELSE RAISE; END IF;
  END;
  IF NOT thrown THEN RAISE EXCEPTION 'club_did_not_block_normal_%',res; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.gk2_day_availability(d)->'blocks') b WHERE b->>'target'='hyzr' AND b->>'start_min'='1140')
 THEN RAISE EXCEPTION 'simulator_display_not_blocked'; END IF;
 PERFORM public.gk2_hold_club_seats(gen_random_uuid(),d,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',9);
 thrown:=false;
 BEGIN PERFORM public.gk2_hold_club_seats(gen_random_uuid(),d,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',1);
 EXCEPTION WHEN others THEN IF SQLERRM='club_full' THEN thrown:=true; ELSE RAISE; END IF; END;
 IF NOT thrown THEN RAISE EXCEPTION 'capacity_exceeded'; END IF;
 -- A normal booking finishing at 19:00 does not overlap.
 PERFORM public.gk2_hold_slot(gen_random_uuid(),d,'hyzr',1110,30,'gk-v1');
 UPDATE gk2_private.club_enrolments SET status='cancelled' WHERE slot_date=d;
 PERFORM public.gk2_hold_slot(gen_random_uuid(),d,'hyzr',1140,30,'gk-v1');
 RAISE NOTICE 'PASS: all activities block club, club blocks all, capacity ten, boundary19:00, cancellation releases';
END $tests$;
ROLLBACK;
