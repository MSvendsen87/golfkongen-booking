# Booking 2.0 – samkjørt status PC og mobil 25.10.2026

## Verifisert mot faktisk stagingdatabase (read-only)
Prosjekt `golfkongen-minbag-staging` (`eadgdcimcmfyuicizboo`), privat schema `gk2_private`. **Ingen databaseendringer i denne kontrollen**.

- `gk2_private.checkout_product_plans`: 33 knyttede Quickbutik-varighetsprodukter, 0 `is_ready`, 0 `publish_enabled`, 0 `verified_group_prices`, 0 `verified_variant_calendar`, 0 `verified_checkout_payment`.
- `gk2_private.group_price_entry_status`: **121 av 121 rapportert lagt inn** (`entered_reported`), **0 kasseverifisert**. Brukeren bekrefter å ha ført inn alle spesialprisene manuelt. **IKKE be om masseinnføring på nytt.**
- `gk2_private.price_policies`: 264 rader for 8 grupper. Alle fortsatt inaktive prisutkast i den isolerte DB-en; ingen av dem styrer kundecheckout i dag.
- `gk2_private.booking_settings`: 45 dagers vindu, første bookbare 2026-11-01. `release_gates`: alle åtte FALSE.
- Supabase Auth inneholder nå **én konto for hver av de to tillatte e-postadressene** `post@golfkongen.no` og `kristoffer.mrk@gmail.com`. Dette er endret siden eldre dokument som sa 0 brukere. Fullt admin login E2E trenger fortsatt verifisering fra nettleseren.

## Viktige funn fra PC-utvikling (ikke gjør dobbelt)
- PC-økten installerte privat DB, Edge API `gk-booking-v2` (nå versjon 13), stagingadmin på `https://msvendsen87.github.io/golfkongen-booking/` og kundestaging på `https://msvendsen87.github.io/golfkongen-booking/booking/`.
- 33 Quickbutik-varighetsprodukter ID 1474–1506 finnes allerede, skjult/ikke salgbare. 121 spesialpriser lagt inn av eier. Ingen aktive release gates.
- Quickbutik API for vanlige `get_product` viser bare ordinær produkt-/variantpris – **ikke gruppespesifikke priser**. Derfor kan ikke dette verifiseres via produktlesing.
- **Gamle** Quickbutik-produkter 1316, 1317, 1320 og 1349 inneholder per 25.10 kun 40 dager, 25.10–03.12; **ny** Supabase-stagingkalender har rullerende 45 dager. Disse tallene beskriver to forskjellige systemer og er ikke motstridende.
- PC-økten laget GitHub Actions-jobb `.github/workflows/gk2-rolling-variants.yml` på `main`, og staging-script i `booking-v2/scripts/quickbutik-rolling-sync.mjs`. Den er beskrevet som **skriving AV som standard** `GK2_VARIANT_SYNC_WRITE=false`. Selv med variant-prewarm vil Quickbutik lager=0 og ingen varer være salgbare.
- Et kontrollert Quickbutik-variantpilot avdekket at API `variants.add` kan opprette `hidden=false`, og at `visible:null` kan returneres ved etterlesing. **IKKE aktivér bulk-write** før verifikasjons- og skjulingslogikk er testet. Ingen forsøk på nye API-writes i denne økten.

## Utført i denne mobil-/PC-samkjøringen
- Eksisterende **GitHub Pages kundestaging** `docs/booking/index.html` er oppdatert i utviklingsgrenen (commit `2bcba8e14db72ac67ff703e4801d5f2ab4154b62`) – IKKE ny separat design.
- Valgfritt **leie av dartpiler** 0–6 sett à **25 kr** vises på dartbane A, dartbane B og hele lokalet, skjules og nullstilles på HYZR. Vises i previewoppsummering som eget tillegg, **uten å dikte opp innlogget gruppepris**.
- Lenke til gjeldende bookingvilkår i eksisterende obligatoriske vilkårsmodal. Viktig: Checkout er fortsatt **hardt deaktivert** (`checkoutVerified:false`), så dette er UI-staging, ikke funksjonell kasse.

## Det som gjenstår (i prioritert rekkefølge)
1. Bekreft ÉN kontrollpris under riktig innlogget Quickbutik-kundegruppe. Siden 33 varer fortsatt er skjulte med null lager, kan kun adminvisning av lagret gruppepris kontrolleres nå – **ikke lov ekte kassetest før kontrollert testprodukt gjøres salgbart med sikre krav**.
2. Styrket variant sync med trygg håndtering av API `visible:null`, default `hidden:false`, duplikat-SKU, rate limits og etterlesing. Hold automatisk writes AV frem til verifisert og eksplisitt godkjent test.
3. Verifiser ekte Quickbutik-autorisasjon/checkout, gruppeidentitet og korrekt kassebeløp for en kontrollert ny booking. Betalt Quickbutik `order.new`-webhook må verifiseres server-side, bindes idempotent til ett hold, og opprette én booking.
4. Test og bevar eksisterende Make/Cloudflare/Pushover med nøyaktig ett varsel. Ikke rør live Pushover mens dette ikke er verifisert.
5. Importer komplett fremtidig betalt legacy bookinghistorikk, kjør concurrency- og RLS-kontroller, sikker admin-test, koordiner gammel cron før overgang. Åtte release gates må fortsatt være falske fram til hver enkelt faktisk test er bestått.
6. Få siste UI-kontroll fra eier på staging; ikke redesign.

**Presis status:** Staging er reelt installert og utvidet, men alle bookingproduktene er usalgbare. Ikke publiser/live-migrer.
