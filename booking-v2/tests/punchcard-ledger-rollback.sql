-- Run in a transaction. These checks never send emails or create door codes.
BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE booking jsonb; day date:=(now() AT TIME ZONE 'Europe/Oslo')::date+25; key uuid:=gen_random_uuid();
BEGIN
 PERFORM public.gk2_punchcard_purchase('999999981','punch-test@example.invalid',false,2);
 PERFORM public.gk2_punchcard_purchase('999999981','punch-test@example.invalid',false,2);
 IF (public.gk2_punchcard_account('punch-test@example.invalid')->>'minutes')::int<>1200 THEN RAISE EXCEPTION 'duplicate purchase credit'; END IF;
 booking:=public.gk2_punchcard_book('punch-test@example.invalid',key,day,600,90);
 PERFORM public.gk2_punchcard_book('punch-test@example.invalid',key,day,600,90);
 IF (public.gk2_punchcard_account('punch-test@example.invalid')->>'minutes')::int<>1110 THEN RAISE EXCEPTION 'duplicate booking debit'; END IF;
 BEGIN
  PERFORM public.gk2_punchcard_book('other@example.invalid',key,day,600,90);
  RAISE EXCEPTION 'cross-account replay allowed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%key_reuse%' THEN RAISE; END IF;
 END;
 PERFORM public.gk2_punchcard_cancel('punch-test@example.invalid',(booking->>'id')::uuid);
 PERFORM public.gk2_punchcard_cancel('punch-test@example.invalid',(booking->>'id')::uuid);
 IF (public.gk2_punchcard_account('punch-test@example.invalid')->>'minutes')::int<>1200 THEN RAISE EXCEPTION 'duplicate refund'; END IF;
 PERFORM public.gk2_punchcard_purchase('999999981','punch-test@example.invalid',true,2);
 IF (public.gk2_punchcard_account('punch-test@example.invalid')->>'minutes')::int<>0 THEN RAISE EXCEPTION 'cancelled card spendable'; END IF;
END $$;
ROLLBACK;
