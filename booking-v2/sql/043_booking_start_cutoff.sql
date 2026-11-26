-- Update the deployed customer booking functions without replacing their other rules.
CREATE OR REPLACE FUNCTION gk2_private.booking_start_open(
  p_day date, p_start integer, p_resource text, p_now timestamptz
)
RETURNS boolean
LANGUAGE sql STABLE STRICT
SET search_path = pg_catalog
AS $$
  SELECT ((p_day::timestamp + make_interval(mins => p_start)) AT TIME ZONE 'Europe/Oslo')
    > p_now + make_interval(mins => CASE WHEN p_resource = 'venue' THEN 20 ELSE 10 END);
$$;

REVOKE ALL ON FUNCTION gk2_private.booking_start_open(date,integer,text,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION gk2_private.booking_start_open(date,integer,text,timestamptz)
  TO service_role;

DO $patch$
DECLARE
  hold_def text := pg_get_functiondef('public.gk2_hold_slot(uuid,date,text,integer,integer,text)'::regprocedure);
  punch_def text := pg_get_functiondef('public.gk2_punchcard_book(text,uuid,date,integer,integer)'::regprocedure);
  old_hold_check constant text := '(p_day=v_today AND p_start<v_mins+20)';
  old_hold_clock constant text := $clock$ v_mins:=extract(hour from now() AT TIME ZONE 'Europe/Oslo')::int*60+
         extract(minute from now() AT TIME ZONE 'Europe/Oslo')::int;
$clock$;
  old_punch_check constant text := $check$((p_day::timestamp+make_interval(mins=>p_start)) AT TIME ZONE 'Europe/Oslo')<=now()+interval '20 minutes'$check$;
BEGIN
  IF strpos(hold_def, old_hold_check) = 0 OR strpos(hold_def, old_hold_clock) = 0
    OR strpos(punch_def, old_punch_check) = 0 THEN
    RAISE EXCEPTION 'Booking deadline migration expected the existing 20-minute checks';
  END IF;

  hold_def := replace(hold_def, 'v_today date;v_mins integer;', 'v_today date;');
  hold_def := replace(hold_def, old_hold_clock, '');
  hold_def := replace(hold_def, old_hold_check,
    'NOT gk2_private.booking_start_open(p_day,p_start,p_resource,now())');
  punch_def := replace(punch_def, old_punch_check,
    'NOT gk2_private.booking_start_open(p_day,p_start,''hyzr'',now())');

  EXECUTE hold_def;
  EXECUTE punch_def;
END;
$patch$;
