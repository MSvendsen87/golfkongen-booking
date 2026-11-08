CREATE OR REPLACE FUNCTION public.gk2_admin_booking_usage(p_actor text, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE v_slots jsonb;v_revenue jsonb;v_total bigint;v_count integer;
BEGIN
  IF current_user IS DISTINCT FROM 'service_role' OR NOT public.gk2_is_admin(p_actor) THEN
    RAISE EXCEPTION 'admin_forbidden';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to>p_from+93
     OR p_from<(now() AT TIME ZONE 'Europe/Oslo')::date-366
     OR p_to>(now() AT TIME ZONE 'Europe/Oslo')::date+90 THEN
    RAISE EXCEPTION 'invalid_date_range';
  END IF;

  WITH days AS (
    SELECT day::date AS day FROM generate_series(p_from,p_to,interval '1 day') AS day
  ), calendar AS (
    SELECT h.resource,d.day,x.slot_min
    FROM days d JOIN gk2_private.opening_hours h
      ON h.weekday=extract(isodow from d.day)::integer AND h.active
      AND h.resource IN ('hyzr','dart_a','dart_b')
    CROSS JOIN LATERAL generate_series(h.opens_min,h.closes_min-30,30) AS x(slot_min)
  ), unblocked AS (
    SELECT c.* FROM calendar c
    WHERE NOT EXISTS(
      SELECT 1 FROM gk2_private.blocks bl
      WHERE bl.active AND c.day BETWEEN bl.date_from AND bl.date_to
        AND (bl.weekdays IS NULL OR c.day IS NOT NULL AND extract(isodow from c.day)::integer=ANY(bl.weekdays))
        AND bl.start_min<c.slot_min+30 AND bl.end_min>c.slot_min
        AND bl.target IN ('all',c.resource)
    )
  ), slots AS (
    SELECT c.resource,c.day,c.slot_min,
      EXISTS(
        SELECT 1 FROM gk2_private.reservations r
        WHERE r.slot_date=c.day
          AND (r.resource=c.resource OR r.resource='venue')
          AND r.start_min<c.slot_min+30 AND r.end_min>c.slot_min
          AND r.status='confirmed' AND r.verified_paid_at IS NOT NULL AND r.paid_ore IS NOT NULL
      ) OR (
        c.resource IN ('dart_a','dart_b') AND c.slot_min>=1140 AND c.slot_min<1320
        AND EXISTS(
          SELECT 1 FROM gk2_private.club_enrolments ce
          WHERE ce.slot_date=c.day AND ce.status='confirmed' AND ce.verified_paid_at IS NOT NULL
        )
      ) AS occupied,
      EXISTS(
        SELECT 1 FROM gk2_private.reservations r
        WHERE r.slot_date=c.day
          AND (r.resource=c.resource OR r.resource='venue')
          AND r.start_min<c.slot_min+30 AND r.end_min>c.slot_min
          AND r.status IN ('held','payment_pending')
          AND (r.hold_expires_at>now() OR EXISTS(
                SELECT 1 FROM gk2_private.checkout_variant_leases l
                WHERE l.reservation_id=r.id AND l.status<>'closed'))
      ) OR (
        c.resource IN ('dart_a','dart_b') AND c.slot_min>=1140 AND c.slot_min<1320
        AND EXISTS(
          SELECT 1 FROM gk2_private.club_enrolments ce
          WHERE ce.slot_date=c.day AND ce.status IN ('held','payment_pending')
            AND ce.hold_expires_at>now()
        )
      ) AS held
    FROM unblocked c
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'resource',s.resource,
    'openMinutes',s.open_slots*30,
    'occupiedMinutes',s.occupied_slots*30,
    'heldMinutes',s.held_slots*30,
    'freeMinutes',(s.open_slots-s.occupied_slots-s.held_slots)*30,
    'occupancyPercent',CASE WHEN s.open_slots>0
      THEN round(100.0*s.occupied_slots/s.open_slots,1) ELSE 0 END
  ) ORDER BY s.resource),'[]'::jsonb)
  INTO v_slots
  FROM (
    SELECT resource,count(*)::int AS open_slots,
      count(*) FILTER(WHERE occupied)::int AS occupied_slots,
      count(*) FILTER(WHERE NOT occupied AND held)::int AS held_slots
    FROM slots GROUP BY resource
  ) s;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'resource',res.resource,'confirmedBookings',res.bookings,'actualPaidOre',res.revenue_ore,
      'punchcardMinutes',res.punchcard_minutes
     ) ORDER BY res.resource),'[]'::jsonb),
     coalesce(sum(res.revenue_ore),0)::bigint,coalesce(sum(res.bookings),0)::int
  INTO v_revenue,v_total,v_count
  FROM (
    SELECT r.resource,count(*)::int AS bookings,coalesce(sum(r.paid_ore),0)::bigint AS revenue_ore,
      coalesce(sum(r.end_min-r.start_min) FILTER(WHERE r.customer_ref='punchcard'),0)::int AS punchcard_minutes
    FROM gk2_private.reservations r
    WHERE r.slot_date BETWEEN p_from AND p_to AND r.status='confirmed'
      AND r.verified_paid_at IS NOT NULL AND r.paid_ore IS NOT NULL
    GROUP BY r.resource
  ) res;

  RETURN jsonb_build_object(
    'ok',true,'from',p_from,'to',p_to,
    'physicalResources',v_slots,
    'revenueByBookingType',v_revenue,
    'totalVerifiedPaidOre',v_total,
    'confirmedBookings',v_count,
    'note','Revenue uses actual paid booking amount; club-evening revenue is not included. Venue occupancy counts for all three physical resources.'
  );
END;
$function$

REVOKE ALL ON FUNCTION public.gk2_admin_booking_usage(text,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_admin_booking_usage(text,date,date) TO service_role;
