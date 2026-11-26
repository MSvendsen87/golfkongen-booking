# Rettet admin_forbidden 25. oktober 2026

Feil fra offentlig test-URL for GitHub Pages: innlogging ga admin_forbidden.

Faktisk logggrunnlag: Supabase Auth passordinnlogging 200 OK, auth.getUser 200 OK, men PostgREST RPC gk2_is_admin ga 400 med PostgreSQL-feilen "forbidden". Årsak: initiale gk2_* SECURITY DEFINER-funksjoner brukte current_setting('request.jwt.claim.role',true) og antok at denne var service_role. Dette var ikke sant i det virkelige RPC-kallet.

**Endret i riktig Supabase-prosjekt** golfkongen-minbag-staging, kun public.gk2_* funksjoner, via migration booking2_fix_invoker_admin_auth_role:
- Alle 11 Booking 2.0-RPC-ene gjort SECURITY INVOKER i stedet for SECURITY DEFINER.
- I akkurat de 11 RPC-ene byttet adgangskontrollen fra current_setting('request.jwt.claim.role',true) til current_user.
- Restriksjonene i rollen beholdt. Bare service_role har EXECUTE, anon/authenticated har ingen RPC EXECUTE. Separat privat schema gk2_private har RLS.
- Edge-APIet verifiserer fortsatt et ekte Supabase Auth-token og krever en godkjent admin e-post før service_role RPC-kallet.
- Ingen deploy av Edge eller endring av frontend var nødvendig.

**Testet mot ekte database** med SET LOCAL ROLE service_role i en transaksjon med ROLLBACK:
- Begge godkjente adminkontoer godtas.
- Ukjent konto avvises.
- Admin snapshot svarer.
- bookingEnabled false.
- 11/11 RPC-er tilgjengelig for service_role; 0 for anon og authenticated; 0 SECURITY DEFINER blant Booking 2.0-RPC-ene.
- Antall eksisterende minbag-tabeller fremdeles 51.
- Lanseringslås for kundebooking er fortsatt stengt.

**Mangler sluttkontroll:** Eier må prøve GitHub Pages-innlogging på nytt for bekreftelse av nettleser -> Edge -> REST -> database. Ikke erklær ekte innlogging verifisert før dette er gjort.

URL: https://msvendsen87.github.io/golfkongen-booking/
