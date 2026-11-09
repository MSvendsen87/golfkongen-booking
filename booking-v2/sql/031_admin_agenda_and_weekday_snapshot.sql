-- Booking 2.0 Admin: day-accurate recurring blocks and owner-only 21-day agenda.
-- Applied to production 2026-10-28. Idempotent CREATE OR REPLACE for reproducibility.
-- IMPORTANT: these are SECURITY INVOKER functions callable by service_role only.

CREATE OR REPLACE FUNCTION public.gk2_admin_snapshot(p_actor text, p_day date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE v_res jsonb;v_blocks jsonb;v_prices jsonb;v_member jsonb;v_comp jsonb;v_hours jsonb;v_gates jsonb;
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' OR NOT public.gk2_is_admin(p_actor)
 THEN RAISE EXCEPTION 'admin_forbidden';END IF;
 IF p_day IS NULL OR p_day<current_date-90 OR p_day>current_date+180 THEN RAISE EXCEPTION 'date_out_of_bounds';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'date',slot_date,'resource',resource,'start',start_min,'end',end_min,'status',status,'order',quickbutik_order_id)), '[]'::jsonb)
 INTO v_res FROM gk2_private.reservations WHERE slot_date=p_day;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'target',target,'dateFrom',date_from,'dateTo',date_to,'start',start_min,'end',end_min,'label',label,'weekdays',weekdays)), '[]'::jsonb)
 INTO v_blocks FROM gk2_private.blocks WHERE active AND p_day BETWEEN date_from AND date_to
  AND (weekdays IS NULL OR extract(isodow from p_day)::integer=ANY(weekdays));
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'resource',resource,'group',group_code,'minutes',minutes,'priceOre',price_ore,'active',active,'notes',notes)), '[]'::jsonb)
 INTO v_prices FROM gk2_private.price_policies;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'email',requested_email,'group',group_code,'action',action,'state',state)), '[]'::jsonb)
 INTO v_member FROM gk2_private.membership_changes WHERE state='pending';
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'starts',starts_on,'ends',ends_on,'format',format,'status',status)), '[]'::jsonb)
 INTO v_comp FROM gk2_private.tournaments;
 SELECT coalesce(jsonb_agg(jsonb_build_object('resource',resource,'weekday',weekday,'opens',opens_min,'closes',closes_min,'active',active)), '[]'::jsonb)
 INTO v_hours FROM gk2_private.opening_hours;
 SELECT to_jsonb(g) - 'singleton' INTO v_gates FROM gk2_private.release_gates g WHERE singleton;
 RETURN jsonb_build_object('bookings',v_res,'blocks',v_blocks,'prices',v_prices,'membershipRequests',v_member,'tournaments',v_comp,'openingHours',v_hours,'releaseGates',v_gates);
END;$function$


CREATE OR REPLACE FUNCTION public.gk2_admin_agenda(p_actor text, p_from date, p_days integer DEFAULT 21)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF current_user IS DISTINCT FROM 'service_role'
    OR NOT public.gk2_is_admin(p_actor) THEN
    RAISE EXCEPTION 'admin_forbidden';
  END IF;
  IF p_from IS NULL
    OR p_from < current_date - 30
    OR p_from > current_date + 180
    OR p_days IS NULL OR p_days NOT BETWEEN 1 AND 45 THEN
    RAISE EXCEPTION 'invalid_agenda_range';
  END IF;
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'date', r.slot_date,
      'start', r.start_min,
      'end', r.end_min,
      'resource', r.resource,
      'status', r.status,
      'order', r.quickbutik_order_id,
      'accessStatus', CASE WHEN r.status='confirmed'
        THEN coalesce(a.status,'not_created') ELSE NULL END
    ) ORDER BY r.slot_date, r.start_min, r.id
  ),'[]'::jsonb) INTO v_result
  FROM gk2_private.reservations r
  LEFT JOIN gk2_private.booking_access_codes a
    ON a.reservation_id = r.id
  WHERE r.slot_date BETWEEN p_from AND p_from + (p_days - 1)
    AND (
      r.status='confirmed'
      OR (r.status IN ('held','payment_pending') AND r.hold_expires_at > now())
    );
  RETURN v_result;
END;
$function$


REVOKE ALL ON FUNCTION public.gk2_admin_agenda(text,date,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_admin_agenda(text,date,integer) TO service_role;
