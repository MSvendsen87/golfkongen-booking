# Booking 2.0 – rullerende 45 dager og sperre mot dobbeltbooking (25.10.2026)

## Implementert og verifisert
- Rullerende 45-dagersregel i **gk2_private.booking_settings**, med norsk kalender (`Europe/Oslo`), `horizon_days=45`, og tidligste bookingdato **2026-11-01**. Datoer regnes på serveren, og `gk2_booking_window()` er kilde for både kundeside og admin.
- `gk2_hold_slot()` bruker samme 45-dagersvindu, ikke den tidligere hardkodede `+40`. Hele lokalet bookes nå bare i hele timer (4–12t), i tråd med 33 Quickbutik-varighetsprodukter.
- Databaseverifikasjon med transaksjon + ROLLBACK: 25.10.2026→09.12.2026 innenfor (45), 10.12 avvist, reservert HYZR 10:00–11:00 hindrer overlapping HYZR 10:30 og hele lokalet 10–14, og `gk2_day_availability()` viser den holdte tidsressursen. Alle testskrivinger rullet tilbake. Fysisk ressurslåsing bruker primærnøkkel/unikhet i `gk2_private.claims`, datolås ved overlapp, samt blokker, åpningstider og allerede betalte bookinger.
- `GET /window` på eksisterende Supabase Edge-funksjon `gk-booking-v2` leser samme live kalender. `GET /admin/integration-readiness` krever autorisert administrator og rapporterer betalingsblokker, produktmapping, kundepriser og servernøkkelstatus (bare bool, aldri nøkkel).
- Kundetest `https://msvendsen87.github.io/golfkongen-booking/booking/` beregner dato i `Europe/Oslo` og første/siste dato ut fra +45 **hver gang siden åpnes**, og kontrollerer datobytte hvert minutt når siden står åpen. Før Nov1 er første dato alltid Nov1. `/availability` servervaliderer likevel den faktiske perioden. Ingen browser-klokke kan reservere ulovlige datoer.
- Admin `https://msvendsen87.github.io/golfkongen-booking/` viser rullerende vindu i **Kalender** og bekreftelse av integrasjon/gates i **Kassekontroll**.

## Automatisk Quickbutik-variantpåfyll (forberedt, IKKE skrivetilgang ennå)
- GitHub Actions workflow opprettet på **main**: `.github/workflows/gk2-rolling-variants.yml`.
- Skjema: daglig kl. **22:05 og 23:05 UTC**, slik at minst én kjøring kommer ca. **5 minutter etter norsk midnatt**, både sommer/vinter. Idempotent: to kjøringer oppretter ikke samme SKU om igjen.
- Workflow sjekker ut `booking-v2-preview-2026-10-24`, kjører Node22 `booking-v2/scripts/quickbutik-rolling-sync.mjs`. Manifest `booking-v2/data/quickbutik-duration-manifest.json` inneholder nøyaktig de 33 nye Quickbutik-variantproduktene (1474–1506).
- Skriptet beregner siste dag dynamisk (i dag +45), prioriterer den **nyeste siste dagen for ALLE varigheter** før eldre manglende varianter, leser eksisterende Quickbutik-SKUer først, lager kun nye `variants.add`-oppføringer og oppdaterer aldri gammel vare eller gamle varianter.
- `qty=0`, `preorder=0` og parent `visible=0` for ny variant under hele prewarm-fasen. Ingen kundekjøp åpnes av jobben. **Selve dato-/kalendervinduet trenger ikke cron**; det oppdateres automatisk også uten API-nøkkel. Det er de fysiske Quickbutik-variantradene som må ha synk.
- **TO tilsiktede sperrer på automatiske Quickbutik-skrivinger:** GitHub Actions Secret `GK2_QUICKBUTIK_API_KEY` må eksistere, OG repo variable `GK2_VARIANT_SYNC_WRITE` må være `true`. Hvis én mangler, oppretter jobben **ingen** varianter. Den er for øyeblikket ikke verifisert med ekte skrive-API.
- Repository admin kan legge inn API-nøkkel i GitHub: `Settings → Secrets and variables → Actions → New repository secret`. **Aldri send nøkkelen i en chat, git-commit eller nettside.** Godkjent skrivetilgang i Quickbutik må finnes, se https://quickbutik.com/no/hjelp/hvordan-fungerer-quickbutik-sin-api-og-hvor-kan-jeg-lese-mer.
- Etter nøkkel: start én manuell `workflow_dispatch` i tørrkjøringsmodus (variabel write=false), gjennomgå resultat, aktiver deretter `GK2_VARIANT_SYNC_WRITE=true` først etter vellykket test på en skjult variant. Standard tak 2000 nye varianter/kjøring, rettferdig fordelt på alle 33 produkter og maks 25 varianter per API-oppdatering. Første fullstendige 45-dagersbackfill kan kreve flere kjøringer; dette må overvåkes.
- Viktig volum: ved 10:00–22:00 er ca. 570 mulige start-varighetskombinasjoner per full dag på tvers av HYZR, Dart A, Dart B og hele lokalet. Quickbutik oppgir ubegrensede varianter, men butikkspeed/kapasitet må testes før massetilførsel. https://quickbutik.com/no/hjelp/hvordan-oppretter-jeg-produktvalg-for-mine-produkter

## Betalingsarbeid – klar kode, fortsatt sperret i drift
- `payment-validation.mjs` er fail-closed pure-modul for autoritativ *betalt* Quickbutik-ordre, eksakt vare-ID og SKU, start/slutt, antall, NOK, betalt sum inkludert rabatter, identitet og refusjonsflagg. 14 lokale tester bestått.
- Isolert betalings-RPC `gk2_confirm_paid_slot` testes med `BEGIN/ROLLBACK` og sørger for én booking + én melding i varselkøen; feil pris/for sent betalt sendes til `paid_unallocated/manual_review`, betalingshendelse kan ikke knyttes til to bookinger.
- **Ekte checkout/webhook er IKKE implementert eller aktivert**. Serveren trenger egen verifisert ordrelesing i Quickbutik, korrekt innlogget kundegruppe/pris, sikre hold- og ordre-IDer, webhook-autorisasjon samt integrasjon med gjeldende Make/Cloudflare/Pushover. Ingen «automatisk betalt» kun fra et klient-kall.
- Dagens gamle Quickbutik booking må koordineres med ny: fremtidige allerede betalte bookinger (også kjøpt før oktober) må importeres før begge løsninger kan være aktive, ellers kan to systemer selge samme tid. Ved kontroll av betalte ordre **i oktober** ble Oct31 betalt hele lokalet påvist og bevart (24 claims), men dette er IKKE en historisk fullstendig kontroll.
- **0/33** nye Quickbutik-produkter er salgbare i Booking 2.0, **0** sjekker er validert med ekte betaling. Alle release gates er fortsatt låst. Min Bag 51 tabeller urørt.

## Neste sikkerhetsmilepæler
1. Godkjent Quickbutik skrive-API-hemmelighet satt i GitHub Actions (ikke ChatGPT), test med én skjult variant, deretter trygg initial backfill.
2. Trygg server-autorisasjon av kundegruppe/ordre, kasseflyt og webhook, inkludert rabatt/gavekort; gjennomfør et faktisk betalt testkjøp før åpning.
3. Reconcile hele fremtidig historikk og koordiner gammel cron/produkter ved cutover, deretter sett release gates.
