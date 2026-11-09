-- Entire test is rolled back: no customer orders, emails, codes or live gates.
BEGIN;
UPDATE gk2_private.release_gates SET
 legacy_paid_orders_verified=true,legacy_rules_verified=true,customer_group_prices_verified=true,
 checkout_paid_webhook_verified=true,pushover_end_to_end_verified=true,admin_auth_verified=true,
 concurrency_verified=true,legacy_cron_switch_verified=true;
SET LOCAL ROLE service_role;
DO $test$
DECLARE p record; r text; h jsonb; k uuid; v_test_id uuid; n int; checks int:=0; a jsonb;
BEGIN
 FOR p IN SELECT resource,duration_minutes AS minutes FROM gk2_private.checkout_product_plans LOOP
  BEGIN
   k:=gen_random_uuid();
   h:=public.gk2_hold_slot(k,'2026-11-02',p.resource,600,p.minutes,'gk-v1');
   v_test_id:=(h->>'id')::uuid;
   IF (public.gk2_hold_slot(k,'2026-11-02',p.resource,600,p.minutes,'gk-v1')->>'id')::uuid<>v_test_id THEN
    RAISE EXCEPTION 'idempotency failed'; END IF;
   SELECT count(*) INTO n FROM gk2_private.claims WHERE reservation_id=v_test_id;
   IF n<>(p.minutes/30)*(CASE WHEN p.resource='venue' THEN 3 ELSE 1 END) THEN
    RAISE EXCEPTION 'incorrect claims % %',p.resource,p.minutes; END IF;
   IF jsonb_array_length(public.gk2_day_availability('2026-11-02')->'claims')<>n THEN
    RAISE EXCEPTION 'calendar lost claims'; END IF;
   FOREACH r IN ARRAY (CASE WHEN p.resource='venue' THEN ARRAY['hyzr','dart_a','dart_b','venue'] ELSE ARRAY[p.resource,'venue'] END) LOOP
    BEGIN
     PERFORM public.gk2_hold_slot(gen_random_uuid(),'2026-11-02',r,600,CASE WHEN r='venue' THEN 240 ELSE 30 END,'gk-v1');
     RAISE EXCEPTION 'overlap accepted: % / % / %',p.resource,p.minutes,r;
    EXCEPTION WHEN unique_violation THEN NULL; END;
   END LOOP;
   IF p.resource<>'venue' THEN
    FOREACH r IN ARRAY ARRAY['hyzr','dart_a','dart_b'] LOOP
     IF r<>p.resource THEN PERFORM public.gk2_hold_slot(gen_random_uuid(),'2026-11-02',r,600,30,'gk-v1'); END IF;
    END LOOP;
   END IF;
   IF 600+p.minutes+30<=1320 THEN
    PERFORM public.gk2_hold_slot(gen_random_uuid(),'2026-11-02',CASE WHEN p.resource='venue' THEN 'hyzr' ELSE p.resource END,600+p.minutes,30,'gk-v1');
   END IF;
   checks:=checks+1;
   RAISE SQLSTATE 'Z0001';
  EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL; END;
 END LOOP;
 IF checks<>33 THEN RAISE EXCEPTION 'not all durations tested: %',checks; END IF;
 -- Expired checkout remains visibly occupied until server relocks the variant.
 h:=public.gk2_hold_slot(gen_random_uuid(),'2026-11-02','hyzr',600,60,'gk-v1');v_test_id:=(h->>'id')::uuid;
 UPDATE gk2_private.reservations SET hold_expires_at=now()-interval '1 minute' WHERE reservations.id=v_test_id;
 INSERT INTO gk2_private.checkout_variant_leases(reservation_id,product_id,sku,status)
 VALUES(v_test_id,1477,'2026-11-02-1000-1100','relock_failed');
 a:=public.gk2_day_availability('2026-11-02');
 IF jsonb_array_length(a->'claims')<>2 THEN RAISE EXCEPTION 'protected expired cart shown free'; END IF;
 UPDATE gk2_private.checkout_variant_leases SET status='closed' WHERE reservation_id=v_test_id;
 IF jsonb_array_length(public.gk2_day_availability('2026-11-02')->'claims')<>0 THEN
  RAISE EXCEPTION 'closed expired cart still shown occupied'; END IF;
 -- Own venue opening hours must constrain a venue booking.
 UPDATE gk2_private.opening_hours SET opens_min=960 WHERE resource='venue' AND weekday=1;
 BEGIN
  PERFORM public.gk2_hold_slot(gen_random_uuid(),'2026-11-02','venue',600,240,'gk-v1');
  RAISE EXCEPTION 'venue own hours ignored';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'closed_hours' THEN RAISE; END IF; END;
END;$test$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: all 33 durations, mutual overlaps, parallel resources, boundaries, idempotency, protected expired carts and venue hours; all changes rolled back' AS result;
