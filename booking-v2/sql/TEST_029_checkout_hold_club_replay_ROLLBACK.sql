-- STAGING ONLY. Transactional regression tests; all gates, holds and fixtures ROLLBACK.
-- Requires staging tables, function gk2_mark_cart_variant_open, gk2_checkout_hold_expires
-- and gk2_match_club_paid_order. This SQL must NEVER be committed as a production
-- release gate activation.
BEGIN;
UPDATE gk2_private.release_gates SET
 legacy_paid_orders_verified=true,legacy_rules_verified=true,
 customer_group_prices_verified=true,checkout_paid_webhook_verified=true,
 pushover_end_to_end_verified=true,admin_auth_verified=true,
 concurrency_verified=true,legacy_cron_switch_verified=true WHERE singleton;
UPDATE gk2_private.checkout_product_plans SET
 is_ready=true,publish_enabled=true,verified_group_prices=true,
 verified_variant_calendar=true,verified_checkout_payment=true
 WHERE resource='dart_a' AND duration_minutes=30;
SET LOCAL ROLE service_role;
INSERT INTO gk2_private.club_access_stage(customer_id,active)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true)
ON CONFLICT(customer_id) DO UPDATE SET active=true;

DO $tests$
DECLARE
 day_dart date:=((now() AT TIME ZONE 'Europe/Oslo')::date + 7
 + ((8-extract(isodow from now() AT TIME ZONE 'Europe/Oslo')::integer)%7));
 day_club date:=((now() AT TIME ZONE 'Europe/Oslo')::date + 7
 + ((11-extract(isodow from now() AT TIME ZONE 'Europe/Oslo')::integer)%7));
 h jsonb; h2 jsonb; x jsonb; rid uuid;
 first_exp timestamptz;after_exp timestamptz;repeat_exp timestamptz;rows_count int; state text; sku text;
BEGIN
 -- A verified cart variant is open; buyer receives the actual 30-minute checkout window.
 h:=public.gk2_hold_slot(gen_random_uuid(),day_dart,'dart_a',600,30,'gk-v1');
 rid:=(h->>'id')::uuid;
 PERFORM public.gk2_prepare_cart_intent(rid,'safe-regression@example.invalid',0,true);
 sku:=day_dart::text||'-1000-1030';
 PERFORM public.gk2_mark_cart_variant_opening(rid,1475,sku);
 BEGIN
  PERFORM public.gk2_checkout_hold_expires(rid);
  RAISE EXCEPTION 'closed_lease_returned_expiry';
 EXCEPTION WHEN others THEN
  IF SQLERRM<>'checkout_not_open' THEN RAISE; END IF;
 END;
 SELECT hold_expires_at INTO first_exp FROM gk2_private.reservations WHERE id=rid;
 PERFORM public.gk2_mark_cart_variant_open(rid,282531);
 after_exp:=public.gk2_checkout_hold_expires(rid);
 IF after_exp<now()+interval '29 minutes' OR after_exp<first_exp
 THEN RAISE EXCEPTION 'checkout_expiry_not_extended'; END IF;
 PERFORM public.gk2_mark_cart_variant_open(rid,282531);
 repeat_exp:=public.gk2_checkout_hold_expires(rid);
 IF repeat_exp<>after_exp THEN RAISE EXCEPTION 'checkout_retry_extended_hold'; END IF;
 IF jsonb_array_length(public.gk2_take_expired_cart_leases(10))<>0
 THEN RAISE EXCEPTION 'valid_cart_cleared_early'; END IF;
 UPDATE gk2_private.reservations
 SET hold_expires_at=now()-interval '90 seconds' WHERE id=rid;
 x:=public.gk2_take_expired_cart_leases(10);
 IF jsonb_array_length(x)<>1 OR x->0->>'reservationId'<>rid::text
 THEN RAISE EXCEPTION 'expired_cart_cleanup_failed'; END IF;
 PERFORM public.gk2_finish_cart_variant_relock(rid,true);
 SELECT status INTO state FROM gk2_private.reservations WHERE id=rid;
 SELECT count(*) INTO rows_count FROM gk2_private.claims WHERE reservation_id=rid;
 IF state<>'expired' OR rows_count<>0 THEN RAISE EXCEPTION 'expired_claim_not_released'; END IF;

 -- A paid Quickbutik webhook must remain idempotent even when another
 -- customer hold appears on the same Thursday with identical seat count.
 h:=public.gk2_hold_club_seats(gen_random_uuid(),day_club,
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',2);
 PERFORM public.gk2_bind_club_verified_email((h->>'id')::uuid,
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','safe-regression@example.invalid');
 sku:='GK2-CLUB-'||day_club::text;
 -- This test requires this day to be present in the enabled=false mapping table.
 IF NOT EXISTS (SELECT 1 FROM gk2_private.club_checkout_variants WHERE slot_date=day_club)
 THEN RAISE NOTICE 'No club product variant for %, skipping replay part',day_club;
 ELSE
  x:=public.gk2_match_club_paid_order('76543210',sku,'safe-regression@example.invalid',2,10000);
  IF x->>'matched'<>'true' THEN RAISE EXCEPTION 'club_paid_match_failed'; END IF;
  h2:=public.gk2_hold_club_seats(gen_random_uuid(),day_club,
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',2);
  PERFORM public.gk2_bind_club_verified_email((h2->>'id')::uuid,
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','safe-regression@example.invalid');
  x:=public.gk2_match_club_paid_order('76543210',sku,'safe-regression@example.invalid',2,10000);
  IF x->>'alreadyConfirmed'<>'true' OR x->>'enrolmentId'<>h->>'id'
  THEN RAISE EXCEPTION 'paid_replay_duplicated'; END IF;
 END IF;
END $tests$;
ROLLBACK;
