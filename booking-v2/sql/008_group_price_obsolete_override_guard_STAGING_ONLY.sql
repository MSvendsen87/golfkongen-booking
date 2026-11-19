-- Booking 2.0: upgrade existing isolated gk2_public RPCs to detect obsolete Quickbutik product-specific overrides.
-- This does NOT perform a Quickbutik write. All public/customer permissions stay revoked.
-- gk2_admin_group_price_queue includes previously reported overrides that now equal base price as "remove_override".
-- gk2_admin_group_price_stage(..., 'pending') requires a HUMAN to confirm deletion in Quickbutik when no override is needed.
-- Applied 2026-10-25 to golfkongen-minbag-staging.
CREATE OR REPLACE FUNCTION public.gk2_admin_group_price_queue(p_actor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE out_data jsonb;
BEGIN
 IF current_user <> 'service_role' OR NOT public.gk2_is_admin(p_actor) THEN RAISE EXCEPTION 'admin_forbidden';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'resource',p.resource,'minutes',p.minutes,'group',p.group_code,
  'quickbutikProductId',plan.quickbutik_product_id,'expectedOre',p.price_ore,
  'regularOre',regular.price_ore,
  'stage',CASE WHEN p.price_ore=regular.price_ore AND e.stage IN ('entered_reported','checkout_verified') THEN 'remove_override'
   WHEN e.stage IS NOT NULL AND e.stage<>'pending' AND e.price_ore_at_entry<>p.price_ore THEN 'stale_price'
   ELSE coalesce(e.stage,'pending') END,
  'lastReportedOre',e.price_ore_at_entry,
  'reportedAt',e.reported_at,'verifiedAt',e.verified_at
 ) ORDER BY p.group_code,p.resource,p.minutes),'[]'::jsonb) INTO out_data
 FROM gk2_private.price_policies p
 JOIN gk2_private.price_policies regular ON
   regular.group_code='public' AND regular.resource=p.resource AND regular.minutes=p.minutes
   AND regular.valid_from IS NULL AND regular.valid_to IS NULL
 JOIN gk2_private.checkout_product_plans plan ON plan.resource=p.resource AND plan.duration_minutes=p.minutes
 LEFT JOIN gk2_private.group_price_entry_status e ON e.resource=p.resource
   AND e.duration_minutes=p.minutes AND e.group_code=p.group_code
 WHERE p.group_code<>'public' AND p.valid_from IS NULL AND p.valid_to IS NULL
 AND (p.price_ore<>regular.price_ore OR e.stage IN ('entered_reported','checkout_verified'));
 RETURN out_data;
END; $function$
;
REVOKE ALL ON FUNCTION public.gk2_admin_group_price_queue(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_admin_group_price_queue(text) TO service_role;

CREATE OR REPLACE FUNCTION public.gk2_admin_group_price_stage(p_actor text, p_resource text, p_minutes integer, p_group text, p_stage text, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE v_price integer;v_regular integer;v_prev gk2_private.group_price_entry_status%ROWTYPE;v_id integer;
BEGIN
 IF current_user <> 'service_role' OR NOT public.gk2_is_admin(p_actor) THEN RAISE EXCEPTION 'admin_forbidden';END IF;
 IF p_group NOT IN ('betalt_medlem','teamgolfkongen','frisbee_dart','ansatte','ambassador','frisbeeklubb','dartklubb')
 OR p_stage NOT IN ('pending','entered_reported','checkout_verified')
 OR p_resource NOT IN ('hyzr','dart_a','dart_b','venue') OR length(coalesce(p_note,''))>300
 THEN RAISE EXCEPTION 'invalid_group_price_input';END IF;
 SELECT price_ore INTO v_price FROM gk2_private.price_policies
 WHERE resource=p_resource AND group_code=p_group AND minutes=p_minutes
 AND valid_from IS NULL AND valid_to IS NULL;
 SELECT price_ore INTO v_regular FROM gk2_private.price_policies
 WHERE resource=p_resource AND group_code='public' AND minutes=p_minutes
 AND valid_from IS NULL AND valid_to IS NULL;
 SELECT quickbutik_product_id INTO v_id FROM gk2_private.checkout_product_plans
 WHERE resource=p_resource AND duration_minutes=p_minutes;
 IF v_price IS NULL OR v_regular IS NULL OR v_id IS NULL THEN
   RAISE EXCEPTION 'no_special_price_required';END IF;
 IF v_price=v_regular THEN
   IF p_stage<>'pending' THEN RAISE EXCEPTION 'no_special_price_required';END IF;
   DELETE FROM gk2_private.group_price_entry_status WHERE resource=p_resource AND duration_minutes=p_minutes AND group_code=p_group;
   RETURN jsonb_build_object('ok',true,'resource',p_resource,'minutes',p_minutes,
     'group',p_group,'stage','pending','expectedOre',v_price,'productId',v_id,'quickbutikUpdated',false);
 END IF;
 SELECT * INTO v_prev FROM gk2_private.group_price_entry_status
 WHERE resource=p_resource AND duration_minutes=p_minutes AND group_code=p_group;
 IF p_stage='checkout_verified' AND (NOT FOUND OR v_prev.stage<>'entered_reported' OR v_prev.price_ore_at_entry<>v_price)
 THEN RAISE EXCEPTION 'must_report_entry_before_checkout_validation';END IF;
 INSERT INTO gk2_private.group_price_entry_status
 (resource,duration_minutes,group_code,stage,price_ore_at_entry,reported_at,verified_at,updated_by,note,updated_at)
 VALUES (p_resource,p_minutes,p_group,p_stage,
 CASE WHEN p_stage='pending' THEN NULL ELSE v_price END,
 CASE WHEN p_stage='pending' THEN NULL ELSE now() END,
 CASE WHEN p_stage='checkout_verified' THEN now() ELSE NULL END,
 p_actor,left(coalesce(p_note,''),300),now())
 ON CONFLICT(resource,duration_minutes,group_code) DO UPDATE SET
 stage=excluded.stage, price_ore_at_entry=excluded.price_ore_at_entry,
 reported_at=excluded.reported_at,verified_at=excluded.verified_at,
 updated_by=excluded.updated_by,note=excluded.note,updated_at=now();
 RETURN jsonb_build_object('ok',true,'resource',p_resource,'minutes',p_minutes,'group',p_group,
 'stage',p_stage,'expectedOre',v_price,'productId',v_id,'quickbutikUpdated',false);
END; $function$
;
REVOKE ALL ON FUNCTION public.gk2_admin_group_price_stage(text,text,integer,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_admin_group_price_stage(text,text,integer,text,text,text) TO service_role;
