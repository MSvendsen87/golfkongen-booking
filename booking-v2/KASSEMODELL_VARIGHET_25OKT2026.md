# Booking 2.0 — pris- og kassemodell klargjort 25.10.2026

## Beslutning: Vare per ressurs og varighet, ikke summert halvtimevare
Under reell prissetting ble det oppdaget at én HYZR-halvtime koster 90 kr mens én HYZR-time koster 150 kr, og én dart-halvtime 80 kr / én time 120 kr. En 60-minutterssum av 30-minuttersvarianter ville dermed feilaktig koste HYZR **180 kr** og dart **160 kr**. Dette er ikke en avrundingsfeil; 30-minuttersprisen er bevisst høyere relativt sett. I tillegg sier Quickbutik-dokumentasjonen at gruppepriser på **produktnivå** overstyrer generell gruppe-rabatt på produktet. Dermed kan ikke 30/60/90/120 ligge i ett Quickbutik-produkt hvis samme kundegruppe skal få en egen korrekt pris per varighet.

Kilder:
- https://quickbutik.com/no/hjelp/hvordan-tilpasser-jeg-priser-for-en-kundegruppe
- https://quickbutik.com/no/hjelp/hvordan-oppretter-jeg-rabatter-i-quickbutik
- https://quickbutik.com/no/hjelp/hvordan-fungerer-quickbutik-sin-api-og-hvor-kan-jeg-lese-mer

**Ny arkitektur:** Ett Quickbutik-produkt *per aktivitet og varighet*, med mange date/start-time-varianter under dette produktet. 30,60,90,120,150,180,210,240 minutter for HYZR, Dart A, Dart B = 24 produkter; Hele lokalet 4–12 timer per time = 9; **33 planlagte produkter totalt**. Personlige prisregler på hver varighet tilordnes riktig kundegruppe for dette ene produktet. Supabase `gk2_private.claims` blokkerer hele intervallet i 30-minutters ressurser. En booking oppretter ÉN Quickbutik ordrelinje med hele varigheten og dermed én logisk booking/ett Pushover-varsel — forutsatt vellykket verifisert checkout-integration.

**Ingen 30-dagers-produkter eller salgbare varer er opprettet.** Tidligere skjulte 1474,1475,1476 har én 30min testvariant og forblir skjult, stock 0, pris 0. Disse må enten brukes om som 30min-varigheter etter separat kontroll eller holdes som test/arkiv. Ikke aktiver disse med en generisk kundegruppepris som utilsiktet påvirker alle varigheter.

## Hva ble implementert nå
- Isolert tabell `gk2_private.checkout_product_plans` (RLS på, ikke tilgjengelig for anon eller authenticated): 33 poster, alle `is_ready=false`, `publish_enabled=false`, `quickbutik_product_id=null`. Hver plan har feltene `verified_group_prices`, `verified_variant_calendar`, `verified_checkout_payment`. PostgreSQL CHECK hindrer `is_ready=true` før disse er true og product ID finnes, og hindrer publish true før ready.
- Beskyttet serverfunksjon `public.gk2_admin_checkout_design(actor)` gir 33 planer; `public.gk2_admin_quote_preview(actor,resource,group,minutes)` leser de 264 adminstyrte tariffutkastene og returnerer spesifikk serverberegnet ørepris. Returnerer *alltid* `checkoutEnabled=false` og `verifiedCustomerMembership=false`: dette er ADMIN-test, ikke handlekurv.
- API `gk-booking-v2` har nå `GET /admin/checkout-design` og `GET /admin/quote-preview`. Begge er etter `getUser(JWT)` + e-post allowlist + DB service-role admin-RPC. Ekstern kunde-GET får ikke adgang til admin. `/checkout`, `/hold` og webhook-endepunktene forblir HTTP 503.
- GitHub Pages `docs/index.html` har fått utvidet fane «Kassekontroll» med knappen «Kontroller betalingsoppsett», oversikt 33/0 og intern «Hent sikker pris»-knapp for ressurs, gruppe, varighet.
- Alle SQL-endringer berører bare nye Booking 2.0-objekter. SQL for planer + RPC er versjonert i `booking-v2/sql/006_duration_checkout_plan_STAGING_ONLY.sql`; kildekode for Edge holdes i `booking-v2/supabase/functions/gk-booking-v2/index.ts`, ikke skriv denne om fra scratch.
- ROLLBACK-databasetester er bestått: planantall og launch lock, HYZR 90 min ordinær 240 kr, HYZR 30/60 min ansatt 10/15, hele lokalet ansatt 6 timer 40 kr, Dart ordinær 30 min 80 kr; ukjent admin og feil varighet avvist.
- Sikkerhetskontroll: 33 planer, 0 publiserte, 0 aktive prisutkast (totalt 264), 0 aktiverte launch gates, 24 separate halve-timessperrer for allerede betalte hele lokalet 31. okt, 51 Min Bag-tabeller intakte, 0 direkte kundegrants til gk2_private.

## Hva som GJENSTÅR – IKKE gjør dobbeltarbeid
1. Quickbutik produkt-strategien mot dagens grupper må testes med en kontrollert **varighetsspesifikk skjult testvare** og faktiske spesifikke gruppepriser i kassen. Quickbutik har ingen tilkoblet kundeguppe-prisskrivefunksjon gjennom Quickbutik MCP, så det vil kreve enten manuelt Quickbutik-adminoppsett eller trygg verifisert API-dokumentasjon.
2. Den faktiske medlemmer/ansatte-gruppen må verifiseres på **autentisert Quickbutik-kunde**, aldri selvrapportert gruppe fra klient.
3. Pris i kasse må stemme med database og idempotent ordre bekreftelse; ansatte 98%-regel på gamle produkter må ikke dobbeltkjøres på nye spesialpriser. Test rabattkode/gavekort/medlems-popup separat.
4. Betalt ordre webhook `order.new` i Make/Cloudflare/Pushover kjenner bare gamle produkt-IDer; må kontrollert omstilles til nye bookingprodukt-IDer og gi ett push for én bekreftet booking. Ikke rørt live Pushover.
5. Migrer alle fremtidige betalte bookinger og stengeregler, test samtidig booking, og kontroller gammel Cloudflare cron `0 3 * * *`. Intet automatisk go-live per 1. november.

## Brukertest
Etter GitHub Pages-deploy, åpne https://msvendsen87.github.io/golfkongen-booking/ → «Kassekontroll» → «Kontroller betalingsoppsett» (33 planer / 0 aktive). Test «Hent sikker pris» f.eks HYZR + Ordinær + 90 minutter (skal 240 kr); Ansatte + HYZR + 60 minutter (15 kr). Betaling skal stå stengt. Ingen ekstra abonnement eller Quickbutik endring gjort i denne fasen.
