# Booking 2.0 – kveldsstatus og kontrollert overgang 25.10.2026

## Hva som faktisk er gjort (ikke planlagt)
- Under GolfKongen Testing / eksisterende `golfkongen-minbag-staging`, isolert skjema `gk2_private`, ingen Min Bag-tabeller endret.
- `gk2_private.checkout_product_plans`: **33/33 Quickbutik-varighetsprodukter knyttet til konkrete ID-er 1474–1506**, alle `is_ready=false`, `publish_enabled=false`, 0 gruppepriser verifisert, ingen kassebetaling mulig.
- HYZR og Dart A/B 8 varigheter hver fra 30–240min; hele lokalet 9 varigheter 4–12t.
- Alle 33 Quickbutik-produktene **synlig=false**, stock=0 (på variant der det finnes varianter); det er ingen salgbare Booking 2.0-varer.
- 30min produktene 1474/1475/1476 hadde opprinnelig testpris 0; rettet til ordinær HYZR 90 kr og Dart A/B 80 kr; testvariantene har også riktige priser, hidden=true, qty=0. Produktene er fortsatt skjult.
- Skjulte testvarianter på 1. november opprettet og re-verifisert: 30 min x 3 produkter (282439–282441), 60 min x3 (282442–282444), hele lokalet fire timer (282445). Ingen lager frigitt.
- Migrering `gk2_first_bookable_date_november_1` lagt til i `gk2_hold_slot`: **p_day 2026-11-01 er første gyldige dato**, selv om launch gates settes til true før denne datoen. Allerede betalt 31. oktober-booking blir stående i eget confirmed record (24 claims).
- DB-integrasjonstest i `BEGIN ... ROLLBACK`: passert dato-gulv, Nov1 30min og 60min, idempotent hold, avvist overlappende HYZR-hold, avvist overlappende hele-lokalet, tillatt parallell uavhengig Dart B, og avvist overlappende dart under hele lokalet. 0 prøvehold igjen.
- Egen kundeside PREVIEW ligger nå på `https://msvendsen87.github.io/golfkongen-booking/booking/`, under GitHub Pages-grenen `booking-v2-preview-2026-10-24`. Har HYZR og DartCounter-illustrasjoner, vilkår, innesko/sokker, daterestriksjon og lesende Supabase-kalender. **Kasse er deaktivert**.
- Admin `https://msvendsen87.github.io/golfkongen-booking/` lenker til kundepreview. Prisfanen har CSV-eksport av **264** lagrede kundegruppeprislinjer, hver knyttet til Quickbutik-produkt-ID fra eksisterende beskyttet `/admin/checkout-design` endpoint. CSV eksport betyr IKKE automatisk Quickbutik-prissynk.
- Ren kildekode for idempotent, ZERO-STOCK/HIDDEN Quickbutik variant-batchgenerator i `booking-v2/scripts/quickbutik-hidden-variants-planner.mjs`. Tester på 60min, unike SKUs, 12h venue, zero qty og API update payload består. Den har **ingen nettverkstilgang og kjører ikke automatisk**.
- Dokumentasjonsgrunnlag: Quickbutik offisiell webhook Events https://quickbutik.dev/webhooks/events beskriver `order.new` som **New order (paid)**; dermed bekreftes eiers observasjon om kun betalte Pushover-ordrer. Gjenbruk aktiv Make→Cloudflare/Pushover, og utvid bare produkt-ID-mapping ved kontrollert lansering. Påstander om at `order.new` alene er ubetalt var feil i tidligere plan.
- Quickbutik Offisiell `PUT /v1/products` kan sende `variants.add` og `variants.sync` i batch, se https://quickbutik.dev/api-v1/products/update-products. Kun planlegger bygget, **ikke** ny Worker eller bulk variant write deployet. Unngå massive ChatGPT MCP-enkeltskrivinger.

## Uavklarte, reelle lanseringsblokkere
1. **Kundegruppepriser mangler på nye Quickbutik-produkt-IDer.** Quickbutik MCP har INGEN direkte gruppepris-write. Kassesystemet må få produktspesifikke priser via Quickbutik-admin (7 grupper, 33 varigheter) eller annen *verifisert* API/metode. Ikke erstatt 10/15 kr ansatte med gammel 98%-regel. https://quickbutik.com/no/hjelp/hvordan-tilpasser-jeg-priser-for-en-kundegruppe
2. Bare 7 skjulte testvarianter eksisterer. Need robust, lastkontrollert variantsynk for 1. november og framover, samt sanne lager-/synlighetsregler. `quickbutik-hidden-variants-planner.mjs` genererer trygge payloads, men må kobles til en sikker runtime med eksisterende autorisert QB API-nøkkel. Alle varianter har stock0 inntil kontrollert aktivering.
3. Betaling/sikker checkout hold→Quickbutik basket→betalt webhook→en confirmed booking→ett push, og refusjon/utløpt hold/retry, må verifiseres mot ekte ordre. Ingen public checkout-route aktiv; den returnerer 503.
4. Legacy reserveringer/regler, gammel Cloudflare-cron og gammel direkte booking-kjøp må harmoniseres i én kontrollert cutover med rollback.
5. 0 launch gates aktive, 0 produkter publish_enabled, Pushover og Min Bag uberørt.

## Brukertest og avgjørende handling
Bruk admin **Priser → Last ned Quickbutik-gruppepriser (CSV)** for korrekt produkt-ID, medlem, varighet og pris. Bruk Quickbutik > Kunderegister > Kundegrupper > Rediger gruppe > Legg til spesifikke priser for 1 skjult kontrollprodukt før masseoppsett. For eksempel **Ansatte** på HYZR **60 minutter**, produkt **1477**, ønsket **15 kr**. **Ikke** aktiver varen eller lager. Bekreft at Quickbutik viser lagret spesifikk pris på dette produktet; da kan vi fastsette migrasjonsrutinen før resten. En pris i Booking 2.0-databasen alene påvirker ikke Quickbutik.
