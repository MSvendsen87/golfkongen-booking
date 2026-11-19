BEGIN;
CREATE TABLE gk2_private.manual_price_checks(
 resource text NOT NULL, group_code text NOT NULL, minutes integer NOT NULL,
 checked_ore integer NOT NULL CHECK(checked_ore>=0),policy_changed_at timestamptz NOT NULL,
 checked_at timestamptz NOT NULL DEFAULT now(),checked_by text NOT NULL,
 PRIMARY KEY(resource,group_code,minutes)
);
ALTER TABLE gk2_private.manual_price_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON gk2_private.manual_price_checks FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON gk2_private.manual_price_checks TO service_role;
CREATE FUNCTION public.gk2_admin_manual_price_check(p_actor text,p_resource text,p_group text,
 p_minutes integer,p_ore integer,p_updated timestamptz,p_checked boolean)
RETURNS boolean LANGUAGE plpgsql SET search_path TO 'pg_catalog','gk2_private' AS $f$
DECLARE policy gk2_private.price_policies%ROWTYPE;
BEGIN
 IF current_user<>'service_role' OR NOT public.gk2_is_admin(p_actor) THEN RAISE EXCEPTION 'admin_forbidden';END IF;
 IF p_checked IS NULL OR p_ore IS NULL OR p_updated IS NULL THEN RAISE EXCEPTION 'invalid_price_check';END IF;
 SELECT * INTO policy FROM gk2_private.price_policies WHERE resource=p_resource AND group_code=p_group
 AND minutes=p_minutes AND valid_from IS NULL AND valid_to IS NULL FOR UPDATE;
 IF NOT FOUND OR policy.price_ore<>p_ore OR policy.changed_at<>p_updated THEN RAISE EXCEPTION 'price_changed_reload';END IF;
 IF p_checked THEN
  INSERT INTO gk2_private.manual_price_checks(resource,group_code,minutes,checked_ore,policy_changed_at,checked_at,checked_by)
  VALUES(p_resource,p_group,p_minutes,policy.price_ore,policy.changed_at,now(),lower(p_actor))
  ON CONFLICT(resource,group_code,minutes) DO UPDATE SET checked_ore=excluded.checked_ore,
   policy_changed_at=excluded.policy_changed_at,checked_at=excluded.checked_at,checked_by=excluded.checked_by;
 ELSE
  DELETE FROM gk2_private.manual_price_checks WHERE resource=p_resource AND group_code=p_group AND minutes=p_minutes;
 END IF;
 INSERT INTO gk2_private.audit_events(actor,action,resource_id,payload)
 VALUES(lower(p_actor),'manual_price_check',policy.id::text,jsonb_build_object('checked',p_checked,'ore',policy.price_ore,
 'resource',p_resource,'group',p_group,'minutes',p_minutes));
 RETURN true;
END $f$;
REVOKE ALL ON FUNCTION public.gk2_admin_manual_price_check(text,text,text,integer,integer,timestamptz,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_admin_manual_price_check(text,text,text,integer,integer,timestamptz,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.gk2_admin_price_matrix(p_actor text)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'pg_catalog','gk2_private' AS $f$
DECLARE result jsonb;
BEGIN
 IF current_user<>'service_role' OR NOT public.gk2_is_admin(p_actor) THEN RAISE EXCEPTION 'admin_forbidden';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'resource',p.resource,'group',p.group_code,'minutes',p.minutes,'ore',p.price_ore,'active',p.active,
 'notes',coalesce(p.notes,''),'updated',p.changed_at,
 'manualChecked',c.checked_at IS NOT NULL,'manualCheckedAt',c.checked_at,'manualCheckedBy',c.checked_by
 ) ORDER BY p.group_code,p.resource,p.minutes),'[]'::jsonb) INTO result
 FROM gk2_private.price_policies p LEFT JOIN gk2_private.manual_price_checks c
 ON c.resource=p.resource AND c.group_code=p.group_code AND c.minutes=p.minutes
 AND c.checked_ore=p.price_ore AND c.policy_changed_at=p.changed_at
 WHERE p.valid_from IS NULL AND p.valid_to IS NULL;
 RETURN result;
END $f$;
COMMIT;
