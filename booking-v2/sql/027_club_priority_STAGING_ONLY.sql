-- Staging only. Do not open release gates: legacy club checkout is still external
-- and must join the shared claims/cutover before launch to eliminate cross-system races.
CREATE TABLE gk2_private.club_capacity (
 slot_date date PRIMARY KEY CHECK (extract(isodow from slot_date)=4),
 remaining integer NOT NULL CHECK (remaining BETWEEN 0 AND 10),
 variant_id bigint NOT NULL CHECK (variant_id>0),
 checked_at timestamptz NOT NULL
);
ALTER TABLE gk2_private.club_capacity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON gk2_private.club_capacity FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON gk2_private.club_capacity TO service_role;

CREATE FUNCTION public.gk2_record_club_capacity(p_day date,p_remaining integer,p_variant bigint,p_started timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO pg_catalog,gk2_private AS $$
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_day IS NULL OR extract(isodow from p_day)<>4 OR p_remaining IS NULL OR p_remaining NOT BETWEEN 0 AND 10
 OR p_variant IS NULL OR p_variant<=0 OR p_started IS NULL
 OR p_started>clock_timestamp() OR p_started<clock_timestamp()-interval '15 seconds'
 THEN RAISE EXCEPTION 'invalid_club_observation'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_day::text,0));
 INSERT INTO gk2_private.club_capacity(slot_date,remaining,variant_id,checked_at)
 VALUES(p_day,p_remaining,p_variant,p_started)
 ON CONFLICT(slot_date) DO UPDATE SET remaining=excluded.remaining,variant_id=excluded.variant_id,checked_at=excluded.checked_at
 WHERE excluded.checked_at>club_capacity.checked_at;
END; $$;
REVOKE ALL ON FUNCTION public.gk2_record_club_capacity(date,integer,bigint,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_record_club_capacity(date,integer,bigint,timestamptz) TO service_role;

-- Explicit clock only for deterministic tests. Callable solely by trusted server role.
CREATE FUNCTION gk2_private.club_priority_blocked(p_day date,p_now timestamptz DEFAULT now())
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO pg_catalog,gk2_private AS $$
 SELECT CASE WHEN extract(isodow from p_day)<>4 THEN false
 WHEN (p_now AT TIME ZONE 'Europe/Oslo') < ((p_day-2)+time '00:01') THEN true
 ELSE NOT EXISTS(SELECT 1 FROM gk2_private.club_capacity c WHERE c.slot_date=p_day AND c.remaining=10
  AND c.checked_at<=p_now AND c.checked_at>=p_now-interval '60 seconds') END;
$$;
REVOKE ALL ON FUNCTION gk2_private.club_priority_blocked(date,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION gk2_private.club_priority_blocked(date,timestamptz) TO service_role;
