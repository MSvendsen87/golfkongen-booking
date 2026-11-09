BEGIN;
-- Admin presentation only. Never write price_policies or Quickbutik prices here.
CREATE TABLE gk2_private.admin_display_prices(
 resource text NOT NULL,group_code text NOT NULL,minutes integer NOT NULL,
 price_ore integer NOT NULL CHECK(price_ore BETWEEN 0 AND 10000000),
 note text NOT NULL DEFAULT '',approved_by text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(resource,group_code,minutes)
);
ALTER TABLE gk2_private.admin_display_prices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON gk2_private.admin_display_prices FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON gk2_private.admin_display_prices TO service_role;
CREATE VIEW gk2_private.admin_price_values WITH(security_invoker=true) AS
 SELECT p.*,coalesce(d.price_ore,p.price_ore) AS admin_ore,
 coalesce(d.updated_at,p.changed_at) AS admin_updated,
 coalesce(d.note,p.notes,'') AS admin_note,d.approved_by AS display_approved_by,
 (d.resource IS NOT NULL) AS admin_only
 FROM gk2_private.price_policies p LEFT JOIN gk2_private.admin_display_prices d
 ON d.resource=p.resource AND d.group_code=p.group_code AND d.minutes=p.minutes
 WHERE p.valid_from IS NULL AND p.valid_to IS NULL;
REVOKE ALL ON gk2_private.admin_price_values FROM PUBLIC,anon,authenticated;
GRANT SELECT ON gk2_private.admin_price_values TO service_role;

CREATE OR REPLACE FUNCTION public.gk2_admin_price_matrix(p_actor text)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'pg_catalog','gk2_private' AS $f$
DECLARE result jsonb;
BEGIN
 IF current_user<>'service_role' OR NOT public.gk2_is_admin(p_actor) THEN RAISE EXCEPTION 'admin_forbidden';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'resource',p.resource,'group',p.group_code,'minutes',p.minutes,'ore',p.admin_ore,'active',p.active,
 'notes',p.admin_note,'updated',p.admin_updated,'adminOnly',p.admin_only,
 'manualChecked',c.checked_at IS NOT NULL,'manualCheckedAt',c.checked_at,'manualCheckedBy',c.checked_by
 ) ORDER BY p.group_code,p.resource,p.minutes),'[]'::jsonb) INTO result
 FROM gk2_private.admin_price_values p LEFT JOIN gk2_private.manual_price_checks c
 ON c.resource=p.resource AND c.group_code=p.group_code AND c.minutes=p.minutes
 AND c.checked_ore=p.admin_ore AND c.policy_changed_at=p.admin_updated;
 RETURN result;
END $f$;
CREATE OR REPLACE FUNCTION public.gk2_admin_manual_price_check(p_actor text,p_resource text,p_group text,
 p_minutes integer,p_ore integer,p_updated timestamptz,p_checked boolean)
RETURNS boolean LANGUAGE plpgsql SET search_path TO 'pg_catalog','gk2_private' AS $f$
DECLARE v_ore integer;v_updated timestamptz;v_id uuid;
BEGIN
 IF current_user<>'service_role' OR NOT public.gk2_is_admin(p_actor) THEN RAISE EXCEPTION 'admin_forbidden';END IF;
 IF p_checked IS NULL OR p_ore IS NULL OR p_updated IS NULL THEN RAISE EXCEPTION 'invalid_price_check';END IF;
 PERFORM 1 FROM gk2_private.price_policies WHERE resource=p_resource AND group_code=p_group
 AND minutes=p_minutes AND valid_from IS NULL AND valid_to IS NULL FOR UPDATE;
 SELECT admin_ore,admin_updated,id INTO v_ore,v_updated,v_id FROM gk2_private.admin_price_values
 WHERE resource=p_resource AND group_code=p_group AND minutes=p_minutes;
 IF NOT FOUND OR v_ore<>p_ore OR v_updated<>p_updated THEN RAISE EXCEPTION 'price_changed_reload';END IF;
 IF p_checked THEN
  INSERT INTO gk2_private.manual_price_checks(resource,group_code,minutes,checked_ore,policy_changed_at,checked_at,checked_by)
  VALUES(p_resource,p_group,p_minutes,v_ore,v_updated,now(),lower(p_actor))
  ON CONFLICT(resource,group_code,minutes) DO UPDATE SET checked_ore=excluded.checked_ore,
   policy_changed_at=excluded.policy_changed_at,checked_at=excluded.checked_at,checked_by=excluded.checked_by;
 ELSE
  DELETE FROM gk2_private.manual_price_checks WHERE resource=p_resource AND group_code=p_group AND minutes=p_minutes;
 END IF;
 INSERT INTO gk2_private.audit_events(actor,action,resource_id,payload)
 VALUES(lower(p_actor),'manual_price_check',v_id::text,jsonb_build_object('checked',p_checked,'ore',v_ore,
 'resource',p_resource,'group',p_group,'minutes',p_minutes,'adminDisplayOnly',true));
 RETURN true;
END $f$;
CREATE OR REPLACE FUNCTION public.gk2_admin_save_price_draft(p_actor text,p_resource text,p_group text,
 p_minutes integer,p_price_ore integer,p_note text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'pg_catalog','gk2_private' AS $f$
DECLARE v_ore integer;v_updated timestamptz;
BEGIN
 IF current_user<>'service_role' OR NOT public.gk2_is_admin(p_actor) THEN RAISE EXCEPTION 'admin_forbidden';END IF;
 IF p_price_ore IS NULL OR p_price_ore NOT BETWEEN 0 AND 10000000 OR length(coalesce(p_note,''))>500 THEN RAISE EXCEPTION 'invalid_price_draft';END IF;
 SELECT admin_ore INTO v_ore FROM gk2_private.admin_price_values
 WHERE resource=p_resource AND group_code=p_group AND minutes=p_minutes;
 IF NOT FOUND THEN RAISE EXCEPTION 'missing_active_price';END IF;
 INSERT INTO gk2_private.price_change_drafts(resource,group_code,minutes,proposed_ore,baseline_ore,note,updated_by,updated_at)
 VALUES(p_resource,p_group,p_minutes,p_price_ore,v_ore,coalesce(p_note,''),lower(p_actor),clock_timestamp())
 ON CONFLICT(resource,group_code,minutes) DO UPDATE SET proposed_ore=excluded.proposed_ore,baseline_ore=excluded.baseline_ore,
 note=excluded.note,updated_by=excluded.updated_by,updated_at=excluded.updated_at RETURNING updated_at INTO v_updated;
 INSERT INTO gk2_private.audit_events(actor,action,resource_id,payload) VALUES(lower(p_actor),'price_draft_created',
 p_resource||':'||p_group||':'||p_minutes,jsonb_build_object('proposedOre',p_price_ore,'adminDisplayOnly',true));
 RETURN jsonb_build_object('ok',true,'status','draft_only','proposedOre',p_price_ore,'draftUpdated',v_updated,
 'quickbutikUpdated',false,'activeBookingPriceUpdated',false);
END $f$;
CREATE OR REPLACE FUNCTION public.gk2_admin_price_drafts_list(p_actor text)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'pg_catalog','gk2_private' AS $f$
DECLARE result jsonb;
BEGIN
 IF current_user<>'service_role' OR NOT public.gk2_is_admin(p_actor) THEN RAISE EXCEPTION 'admin_forbidden';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('resource',d.resource,'group',d.group_code,'minutes',d.minutes,
 'proposedOre',d.proposed_ore,'baselineOre',d.baseline_ore,'currentOre',p.admin_ore,
 'stale',p.admin_ore IS DISTINCT FROM d.baseline_ore,'note',d.note,'updated',d.updated_at)
 ORDER BY d.updated_at DESC),'[]'::jsonb) INTO result FROM gk2_private.price_change_drafts d
 LEFT JOIN gk2_private.admin_price_values p ON p.resource=d.resource AND p.group_code=d.group_code AND p.minutes=d.minutes;
 RETURN result;
END $f$;
CREATE FUNCTION public.gk2_admin_approve_display_price(p_actor text,p_resource text,p_group text,
 p_minutes integer,p_ore integer,p_updated timestamptz)
RETURNS boolean LANGUAGE plpgsql SET search_path TO 'pg_catalog','gk2_private' AS $f$
DECLARE d gk2_private.price_change_drafts%ROWTYPE;v_current integer;v_now timestamptz:=clock_timestamp();
BEGIN
 IF current_user<>'service_role' OR NOT public.gk2_is_admin(p_actor) THEN RAISE EXCEPTION 'admin_forbidden';END IF;
 SELECT * INTO d FROM gk2_private.price_change_drafts WHERE resource=p_resource AND group_code=p_group AND minutes=p_minutes FOR UPDATE;
 IF NOT FOUND OR p_ore IS NULL OR p_updated IS NULL OR d.proposed_ore<>p_ore OR d.updated_at<>p_updated THEN RAISE EXCEPTION 'draft_changed_reload';END IF;
 PERFORM 1 FROM gk2_private.price_policies WHERE resource=p_resource AND group_code=p_group
 AND minutes=p_minutes AND valid_from IS NULL AND valid_to IS NULL FOR UPDATE;
 SELECT admin_ore INTO v_current FROM gk2_private.admin_price_values WHERE resource=p_resource AND group_code=p_group AND minutes=p_minutes;
 IF v_current IS NULL OR v_current<>d.baseline_ore THEN RAISE EXCEPTION 'display_price_changed_reload';END IF;
 INSERT INTO gk2_private.admin_display_prices(resource,group_code,minutes,price_ore,note,approved_by,updated_at)
 VALUES(p_resource,p_group,p_minutes,d.proposed_ore,d.note,lower(p_actor),v_now)
 ON CONFLICT(resource,group_code,minutes) DO UPDATE SET price_ore=excluded.price_ore,note=excluded.note,
 approved_by=excluded.approved_by,updated_at=excluded.updated_at;
 INSERT INTO gk2_private.manual_price_checks(resource,group_code,minutes,checked_ore,policy_changed_at,checked_at,checked_by)
 VALUES(p_resource,p_group,p_minutes,d.proposed_ore,v_now,v_now,lower(p_actor))
 ON CONFLICT(resource,group_code,minutes) DO UPDATE SET checked_ore=excluded.checked_ore,
 policy_changed_at=excluded.policy_changed_at,checked_at=excluded.checked_at,checked_by=excluded.checked_by;
 DELETE FROM gk2_private.price_change_drafts WHERE resource=p_resource AND group_code=p_group AND minutes=p_minutes;
 INSERT INTO gk2_private.audit_events(actor,action,resource_id,payload) VALUES(lower(p_actor),'admin_display_price_approved',
 p_resource||':'||p_group||':'||p_minutes,jsonb_build_object('previousOre',v_current,'approvedOre',d.proposed_ore,
 'quickbutikChanged',false,'activeBookingPriceChanged',false));
 RETURN true;
END $f$;
REVOKE ALL ON FUNCTION public.gk2_admin_approve_display_price(text,text,text,integer,integer,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_admin_approve_display_price(text,text,text,integer,integer,timestamptz) TO service_role;
COMMIT;
