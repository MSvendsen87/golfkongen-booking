-- Booking 2.0: isolated staging-only order binding, before payment confirmation.
-- Requires an already valid atomic gk2_hold_slot, and a SERVER-resolved checkout
-- customer, payable total and terms acceptance timestamp. Never accept browser totals.
-- This function does not create a hold, confirm payment, send pushes or enable gates.
BEGIN;

ALTER TABLE gk2_private.reservations
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS rental_sets_count smallint NOT NULL DEFAULT 0
    CHECK (rental_sets_count BETWEEN 0 AND 6);

CREATE OR REPLACE FUNCTION public.gk2_bind_checkout_order(
 p_reservation uuid, p_order text, p_customer_email text,
 p_expected_paid_ore integer, p_rental_sets integer, p_terms_accepted_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE
 b gk2_private.reservations%ROWTYPE;
 required_claims integer;
 actual_claims integer;
 normalized_email text := lower(btrim(p_customer_email));
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_reservation IS NULL OR p_order IS NULL OR p_order !~ '^[1-9][0-9]{0,8}$'
    OR p_customer_email IS NULL OR length(normalized_email)>254
    OR normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    OR p_expected_paid_ore IS NULL OR p_expected_paid_ore<0 OR p_expected_paid_ore>100000000
    OR p_rental_sets IS NULL OR p_rental_sets NOT BETWEEN 0 AND 6
    OR p_terms_accepted_at IS NULL OR p_terms_accepted_at>now()+interval '30 seconds'
    OR p_terms_accepted_at<now()-interval '10 minutes'
 THEN RAISE EXCEPTION 'invalid_checkout_binding'; END IF;

 SELECT * INTO b FROM gk2_private.reservations WHERE id=p_reservation;
 IF NOT FOUND THEN RAISE EXCEPTION 'unknown_reservation'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(b.slot_date::text,0));
 SELECT * INTO b FROM gk2_private.reservations WHERE id=p_reservation FOR UPDATE;
 IF b.status NOT IN ('held','payment_pending') OR b.hold_expires_at IS NULL
    OR b.hold_expires_at<=now() THEN RAISE EXCEPTION 'hold_no_longer_active'; END IF;
 IF b.terms_version NOT LIKE 'gk-v%' THEN RAISE EXCEPTION 'terms_version_missing'; END IF;
 IF b.resource='hyzr' AND p_rental_sets>0 THEN RAISE EXCEPTION 'hyzr_no_dart_sets'; END IF;
 required_claims:=((b.end_min-b.start_min)/30)*CASE WHEN b.resource='venue' THEN 3 ELSE 1 END;
 SELECT count(*) INTO actual_claims FROM gk2_private.claims WHERE reservation_id=b.id;
 IF actual_claims<>required_claims THEN RAISE EXCEPTION 'slot_claims_not_intact'; END IF;

 IF b.quickbutik_order_id IS NOT NULL THEN
   IF b.quickbutik_order_id<>p_order
      OR b.customer_email IS DISTINCT FROM normalized_email
      OR b.quoted_ore IS DISTINCT FROM p_expected_paid_ore
      OR b.rental_sets_count IS DISTINCT FROM p_rental_sets
      OR b.terms_accepted_at IS DISTINCT FROM p_terms_accepted_at
   THEN RAISE EXCEPTION 'checkout_binding_immutable'; END IF;
   RETURN jsonb_build_object('status','payment_pending','reservation',b.id,'duplicate',true);
 END IF;

 UPDATE gk2_private.reservations
 SET quickbutik_order_id=p_order,customer_email=normalized_email,
     quoted_ore=p_expected_paid_ore,rental_sets_count=p_rental_sets,
     terms_accepted_at=p_terms_accepted_at,status='payment_pending',updated_at=now()
 WHERE id=b.id;
 RETURN jsonb_build_object('status','payment_pending','reservation',b.id,'duplicate',false);
END;
$function$;

REVOKE ALL ON FUNCTION public.gk2_bind_checkout_order(uuid,text,text,integer,integer,timestamptz)
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_bind_checkout_order(uuid,text,text,integer,integer,timestamptz)
 TO service_role;

COMMIT;

-- VERIFY IN TEST TXN ONLY; leave every release gate FALSE.
