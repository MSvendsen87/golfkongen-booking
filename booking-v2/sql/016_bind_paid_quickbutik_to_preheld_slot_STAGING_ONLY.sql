-- Booking 2.0 STAGING: reuse legacy Quickbutik cart-first checkout.
-- Customer binds email and terms to a TIME HOLD first. The Quickbutik order
-- number does not exist until checkout, so a verified paid webhook may bind
-- an EXACT matching held slot, with a locked day and unique order ID.
-- No public grants. No checkout opened by this migration.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS gk2_unique_quickbutik_order
 ON gk2_private.reservations(quickbutik_order_id)
 WHERE quickbutik_order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.gk2_prepare_cart_intent(
 p_reservation uuid,p_email text,p_rental_sets integer,p_terms_accepted boolean
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'pg_catalog','gk2_private'
AS $f$
DECLARE r gk2_private.reservations%ROWTYPE; e text:=lower(btrim(p_email));
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden';END IF;
 IF p_reservation IS NULL OR p_email IS NULL OR length(e)>254
 OR e !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
 OR p_terms_accepted IS DISTINCT FROM true
 OR p_rental_sets IS NULL OR p_rental_sets NOT BETWEEN 0 AND 6
 THEN RAISE EXCEPTION 'invalid_cart_intent';END IF;
 SELECT * INTO r FROM gk2_private.reservations WHERE id=p_reservation;
 IF NOT FOUND THEN RAISE EXCEPTION 'no_reservation';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(r.slot_date::text,0));
 SELECT * INTO r FROM gk2_private.reservations WHERE id=p_reservation FOR UPDATE;
 IF r.status<>'held' OR r.quickbutik_order_id IS NOT NULL
 OR r.hold_expires_at IS NULL OR r.hold_expires_at<=now()
 OR r.terms_version NOT LIKE 'gk-v%'
 THEN RAISE EXCEPTION 'hold_not_eligible';END IF;
 IF r.resource='hyzr' AND p_rental_sets>0 THEN RAISE EXCEPTION 'simulator_cannot_rent_dart';END IF;
 IF r.customer_email IS NOT NULL AND
 (r.customer_email<>e OR r.rental_sets_count<>p_rental_sets)
 THEN RAISE EXCEPTION 'cart_intent_immutable';END IF;
 UPDATE gk2_private.reservations
 SET customer_email=e,rental_sets_count=p_rental_sets,
     terms_accepted_at=coalesce(terms_accepted_at,now()),updated_at=now()
 WHERE id=r.id;
 RETURN jsonb_build_object('prepared',true,'id',r.id,'expires',r.hold_expires_at);
END;$f$;

CREATE OR REPLACE FUNCTION public.gk2_match_paid_order_to_hold(
 p_order text,p_product_id integer,p_sku text,p_customer_email text
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'pg_catalog','gk2_private'
AS $f$
DECLARE m text[];day date;st integer;en integer;duration integer;
 e text:=lower(btrim(p_customer_email)); candidate gk2_private.reservations%ROWTYPE;
 n integer;expected_claims integer; actual_claims integer; existing uuid;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_order IS NULL OR p_order !~ '^[1-9][0-9]{0,8}$'
 OR p_sku IS NULL OR p_product_id IS NULL
 OR p_customer_email IS NULL OR length(e)>254
 OR e !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
 THEN RAISE EXCEPTION 'invalid_paid_order_match'; END IF;
 m:=regexp_match(p_sku,'^(20[0-9]{2}-[0-9]{2}-[0-9]{2})-([0-9]{4})-([0-9]{4})$');
 IF m IS NULL THEN RAISE EXCEPTION 'invalid_slot_sku'; END IF;
 BEGIN day:=m[1]::date; EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_slot_day'; END;
 st:=(substring(m[2],1,2)::int*60+substring(m[2],3,2)::int);
 en:=(substring(m[3],1,2)::int*60+substring(m[3],3,2)::int);
 duration:=en-st;
 IF st<0 OR en>1440 OR duration<=0 OR st%30<>0 OR en%30<>0 OR
 substring(m[2],3,2)::int>=60 OR substring(m[3],3,2)::int>=60
 THEN RAISE EXCEPTION 'invalid_slot_interval';END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended(day::text,0));
 SELECT id INTO existing FROM gk2_private.reservations WHERE quickbutik_order_id=p_order LIMIT 1;
 IF FOUND THEN
  RETURN jsonb_build_object('matched',true,'id',existing,'duplicate',true);
 END IF;
 SELECT count(*) INTO n
 FROM gk2_private.reservations r
 JOIN gk2_private.checkout_product_plans p
 ON p.resource=r.resource AND p.duration_minutes=r.end_min-r.start_min
 WHERE p.quickbutik_product_id=p_product_id
 AND r.slot_date=day AND r.start_min=st AND r.end_min=en
 AND r.customer_email=e AND r.status='held' AND
 r.terms_accepted_at IS NOT NULL AND r.hold_expires_at>now();
 IF n<>1 THEN RETURN jsonb_build_object('matched',false,'reason','no_unique_live_hold');END IF;
 SELECT r.* INTO candidate
 FROM gk2_private.reservations r
 JOIN gk2_private.checkout_product_plans p
 ON p.resource=r.resource AND p.duration_minutes=r.end_min-r.start_min
 WHERE p.quickbutik_product_id=p_product_id
 AND r.slot_date=day AND r.start_min=st AND r.end_min=en
 AND r.customer_email=e AND r.status='held'
 AND r.terms_accepted_at IS NOT NULL AND r.hold_expires_at>now()
 FOR UPDATE OF r;
 expected_claims:=(candidate.end_min-candidate.start_min)/30*
 CASE WHEN candidate.resource='venue' THEN 3 ELSE 1 END;
 SELECT count(*) INTO actual_claims FROM gk2_private.claims
 WHERE reservation_id=candidate.id;
 IF actual_claims<>expected_claims THEN
 RETURN jsonb_build_object('matched',false,'reason','claims_not_intact');END IF;
 UPDATE gk2_private.reservations
 SET quickbutik_order_id=p_order,status='payment_pending',updated_at=now()
 WHERE id=candidate.id;
 RETURN jsonb_build_object('matched',true,'id',candidate.id,'duplicate',false);
END;$f$;

REVOKE ALL ON FUNCTION public.gk2_prepare_cart_intent(uuid,text,integer,boolean)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.gk2_match_paid_order_to_hold(text,integer,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_prepare_cart_intent(uuid,text,integer,boolean)
 TO service_role;
GRANT EXECUTE ON FUNCTION public.gk2_match_paid_order_to_hold(text,integer,text,text)
 TO service_role;

COMMIT;
