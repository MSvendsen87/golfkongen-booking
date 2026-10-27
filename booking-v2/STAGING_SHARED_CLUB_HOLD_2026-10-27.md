# Booking 2.0 — staging fremdrift: felles klubb og dart (27.10.2026)

## Faktisk installert i Supabase staging eadgdcimcmfyuicizboo
- Private RLS-tabeller `club_access_stage` og `club_enrolments`, ingen anon/authenticated rettigheter.
- `public.gk2_hold_club_seats(uuid,date,text,integer)` installert med service_role guard, alle opprinnelige 8 release-gates, samme per-dag advisory-lås som `gk2_hold_slot`, aktiv kunde-id-sjekk, maksimum 10 seter, konflikt mot eksisterende dart-claims og 10-minutters hold.
- `gk2_hold_slot` bruker nå aktive klubbenrolments til sperre av dart_a/dart_b/venue torsdag 19–22 i stedet for `club_priority_blocked`. `gk2_day_availability` viser samme klubbblokker. HYZR ikke berørt.
- Tidligere tirsdagsfrigivelse styrer dermed ikke lenger den nye kalender- eller hold-sperren. Den gamle `club_capacity` er bevart som historisk datakilde inntil kontrollert opprydding.

## Utført verifikasjon
- SQL rollback-test A: klubbhold først, ordinært dart_a-hold 19–20 avvises med `club_already_reserved`.
- SQL rollback-test B: dart_b-hold først, klubbhold avvises med `dart_already_reserved`.
- SQL rollback-test C: 9 plasser + 1 plass ga 0 igjen; ellevte plass avvist med `club_full`. HYZR 19–20 forble bookbar parallelt med full klubbkveld.
- Begge testene midlertidig satt med release-gates true KUN inne i transaksjon, `ROLLBACK` til slutt.
- Etterprøve: 0 klubbenrolments, 0 access-rader, 1 eksisterende reservasjon. `legacy_rules_verified` og `legacy_cron_switch_verified` fortsatt false, offentlig checkout fremdeles stengt.

## Fortsatt gjenstår — ikke klare for produksjon
1. End-to-end full klubbleie med autentisert kunde-id, 50 NOK per sete, Quickbutik-vare/variant/cart, betalt order webhook, bind/reservasjon confirm, idempotens, timeout/recovery, cancel/refund og Nuki/varsling. Ikke merk dette verifisert.
2. Admin CRUD for klubbtilgang gjennom faktisk eierautentisert API med audit og korrekt kilde for medlemskap; tabellen finnes, admin-UI/API er ikke ferdig.
3. Test mer omfattende 10/10, samtidige forespørsler, venue, HYZR, overlapping ved 19/22, kortbetalingens utløpte hold, kalender readback og fysisk kode.
4. Eksisterende gamle, bekreftede bookinger må håndteres før gammel kasse fjernes; gamle checkout-innganger skal først fjernes ved kontrollert cutover.
5. Ingen endring av Min Bag-produksjon; ikke slå på release-gates.
