-- GolfKongen Booking 2.0 — staging duration-product plan (run only after review)
-- Existing project: golfkongen-minbag-staging; schema gk2_private only.
-- No Quickbutik products are created by this migration.
CREATE TABLE IF NOT EXISTS gk2_private.checkout_product_plans(
 resource text NOT NULL CHECK(resource IN ('hyzr','dart_a','dart_b','venue')),
 duration_minutes int NOT NULL CHECK(
 (resource='venue' AND duration_minutes BETWEEN 240 AND 720 AND duration_minutes%60=0) OR
 (resource<>'venue' AND duration_minutes BETWEEN 30 AND 240 AND duration_minutes%30=0)),
 quickbutik_product_id int UNIQUE,
 is_ready boolean NOT NULL DEFAULT false,
 verified_group_prices boolean NOT NULL DEFAULT false,
 verified_variant_calendar boolean NOT NULL DEFAULT false,
 verified_checkout_payment boolean NOT NULL DEFAULT false,
 publish_enabled boolean NOT NULL DEFAULT false,
 note text NOT NULL DEFAULT 'Kun planlagt, ikke opprettet eller åpnet i Quickbutik',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(resource,duration_minutes),
 CHECK (NOT is_ready OR (quickbutik_product_id IS NOT NULL AND verified_group_prices AND verified_variant_calendar AND verified_checkout_payment)),
 CHECK (NOT publish_enabled OR is_ready)
);
ALTER TABLE gk2_private.checkout_product_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON gk2_private.checkout_product_plans FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON gk2_private.checkout_product_plans TO service_role;
INSERT INTO gk2_private.checkout_product_plans(resource,duration_minutes)
SELECT v.resource,g.minute FROM (VALUES ('hyzr'),('dart_a'),('dart_b')) v(resource)
CROSS JOIN generate_series(30,240,30) g(minute)
UNION ALL SELECT 'venue',g.minute FROM generate_series(240,720,60) g(minute)
ON CONFLICT(resource,duration_minutes) DO NOTHING;

CREATE OR REPLACE FUNCTION public.gk2_admin_checkout_design(p_actor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE result jsonb;
BEGIN
 IF current_user <> 'service_role' OR NOT public.gk2_is_admin(p_actor) THEN
  RAISE EXCEPTION 'admin_forbidden';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'resource',resource,'minutes',duration_minutes,'quickbutikProductId',quickbutik_product_id,
  'isReady',is_ready,'groupPricesVerified',verified_group_prices,
  'variantCalendarVerified',verified_variant_calendar,
  'paymentVerified',verified_checkout_payment,'publishEnabled',publish_enabled,
  'note',note
 ) ORDER BY resource,duration_minutes),'[]'::jsonb) INTO result
 FROM gk2_private.checkout_product_plans;
 RETURN result;
END; $function$
;
REVOKE ALL ON FUNCTION public.gk2_admin_checkout_design(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_admin_checkout_design(text) TO service_role;

CREATE OR REPLACE FUNCTION public.gk2_admin_quote_preview(p_actor text, p_resource text, p_group text, p_minutes integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE p gk2_private.price_policies%ROWTYPE; catalog gk2_private.checkout_product_plans%ROWTYPE;
BEGIN
 IF current_user <> 'service_role' OR NOT public.gk2_is_admin(p_actor) THEN
  RAISE EXCEPTION 'admin_forbidden';
 END IF;
 IF p_resource NOT IN ('hyzr','dart_a','dart_b','venue')
 OR p_group NOT IN ('public','betalt_medlem','teamgolfkongen','frisbee_dart','ansatte','ambassador','frisbeeklubb','dartklubb')
 OR p_minutes IS NULL
 THEN RAISE EXCEPTION 'invalid_quote_input'; END IF;
 SELECT * INTO p FROM gk2_private.price_policies
 WHERE resource=p_resource AND group_code=p_group AND minutes=p_minutes
 AND valid_from IS NULL AND valid_to IS NULL LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'no_defined_price'; END IF;
 SELECT * INTO catalog FROM gk2_private.checkout_product_plans
 WHERE resource=p_resource AND duration_minutes=p_minutes;
 IF NOT FOUND THEN RAISE EXCEPTION 'no_checkout_plan';END IF;
 RETURN jsonb_build_object('resource',p_resource,'group',p_group,'durationMinutes',p_minutes,
 'priceOre',p.price_ore,'priceActive',p.active,
 'checkoutProductId',catalog.quickbutik_product_id,'catalogReady',catalog.is_ready,
 'checkoutEnabled',false,'verifiedCustomerMembership',false,'quickbutikFinalPriceVerified',false,
 'mode','ADMIN_PREVIEW_ONLY_NO_PAYMENT');
END; $function$
;
REVOKE ALL ON FUNCTION public.gk2_admin_quote_preview(text,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_admin_quote_preview(text,text,text,integer) TO service_role;
