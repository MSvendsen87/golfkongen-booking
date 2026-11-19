BEGIN;
CREATE OR REPLACE FUNCTION public.gk2_admin_group_price_queue(p_actor text)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'pg_catalog','gk2_private' AS $f$
DECLARE result jsonb;
BEGIN
 IF current_user<>'service_role' OR NOT public.gk2_is_admin(p_actor) THEN RAISE EXCEPTION 'admin_forbidden';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'resource',p.resource,'minutes',p.minutes,'group',p.group_code,
  'quickbutikProductId',plan.quickbutik_product_id,'expectedOre',p.admin_ore,
  'regularOre',regular.admin_ore,'adminOnly',p.admin_only,
  'stage',CASE WHEN c.checked_at IS NOT NULL THEN 'manual_checked' ELSE 'pending_manual' END,
  'manualChecked',c.checked_at IS NOT NULL,'manualCheckedAt',c.checked_at,'manualCheckedBy',c.checked_by,
  'entryStage',e.stage,'lastReportedOre',e.price_ore_at_entry,'reportedAt',e.reported_at
 ) ORDER BY p.group_code,p.resource,p.minutes),'[]'::jsonb) INTO result
 FROM gk2_private.admin_price_values p
 JOIN gk2_private.admin_price_values regular ON regular.group_code='public'
  AND regular.resource=p.resource AND regular.minutes=p.minutes
 JOIN gk2_private.checkout_product_plans plan ON plan.resource=p.resource AND plan.duration_minutes=p.minutes
 LEFT JOIN gk2_private.group_price_entry_status e ON e.resource=p.resource
  AND e.duration_minutes=p.minutes AND e.group_code=p.group_code
 LEFT JOIN gk2_private.manual_price_checks c ON c.resource=p.resource AND c.group_code=p.group_code
  AND c.minutes=p.minutes AND c.checked_ore=p.admin_ore AND c.policy_changed_at=p.admin_updated
 WHERE p.group_code<>'public'
 AND (p.admin_ore<>regular.admin_ore OR p.admin_only OR e.stage IN ('entered_reported','checkout_verified'));
 RETURN result;
END $f$;
COMMIT;
