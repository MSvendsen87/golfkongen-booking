# Booking 2.0 — Quickbutik kundegruppepris-kontroll 25. oktober 2026

## Faktisk lagret pris meldt av eier
- **Ansatte → HYZR 60 minutter → Quickbutik produkt 1477 → 15 kr.**
- Eier bekreftet manuelt at prisen er lagret i Quickbutik.
- Quickbutik-tilkoblingens get_product for produkt 1477 **viser bare ordinær pris 150 kr**, og tilbyr ikke lesing av kundegruppespesifikk pris. Derfor har vi registrert **entered_reported**, ikke **checkout_verified**. Ikke merk kassetesten bestått uten å kontrollere et autentisert ansattkjøp/kasse.

## Effektiv prisoverføring
- 264 Booking 2.0-prisrader (8 grupper×33 ressurs/varigheter) finnes i gk2_private.
- **Bare 121 av disse krever Quickbutik-spesialpriser** fordi de avviker fra ordinær pris. Ingen grunn til å taste 264.
- 121 påkrevd, **1 rapportert lagt inn**, **120 utestående**, **0 bekreftet i kasse** ved siste kontroll.
- Quickbutik-dokumentasjon sier spesifikk produktpris overstyrer generell rabatt for innlogget kundegruppe, derfor tryggere enn å stole på ansatte-gammel 98% rabatt. https://quickbutik.com/no/hjelp/hvordan-tilpasser-jeg-priser-for-en-kundegruppe
- Verken Quickbutik connector eller offentlig v1-produkt API ble verifisert å ha kundegruppespesifikk prislese-/skrive-endepunkt. IKKE påstå at rabatten er automatisk synkronisert, selv om gk2 administrasjon sporer den.

## Teknisk installert, isolert
- `gk2_private.group_price_entry_status`: status for ressurs, varighet, kundegruppe, opprinnelig ørepris. RLS på, **0 anon/authenticated grants**, bare service_role.
- To private service-role RPC-er: `gk2_admin_group_price_queue`, `gk2_admin_group_price_stage`, krever reell admin allowlist. Prislisten avledes live fra price_policies og checkout_product_plans. Hvis originalpris endres etter innrapportering, står den som **stale_price**.
- API `gk-booking-v2` Edge versjon **10** tilbyr `GET /admin/group-price-queue` og `POST /admin/group-price-stage`, begge **kun** etter Supabase Auth og allowlist. Ingen Quickbutik writes, ingen checkout åpnet.
- Admin GitHub Pages `docs/index.html` → «Priser» har en ny seksjon «Quickbutik – spesialpriser som faktisk må legges inn», med filter på kundegruppe/status og registrering. Det er et revisjonsspor, **ikke en Quickbutik-prisredigerer**.
- Manuell markering «lagt inn» oppdaterer status; **ikke** `verified_group_prices` eller launch gates.
- 33 Quickbutik-varighetsprodukter 1474–1506 forblir skjult; ingen kundebestilling fra Booking 2.0 er aktivert. Supabase har 0 planer is_ready/publish_enabled, alle Quickbutik gruppepriser må testes mot faktisk innlogget kunde før åpning.
- Min Bag 51 eksisterende public.minbag_* tabeller er ikke endret. Betalt booking av hele lokalet 31.10 beholdes.

## Neste trygge trinn for eier
1. Oppdater `https://msvendsen87.github.io/golfkongen-booking/` med Ctrl+Shift+R.
2. Åpne **Priser**, rull til «Quickbutik – spesialpriser som faktisk må legges inn».
3. Velg kundegruppe **Ansatte** og status **Alle**. Produkt **1477**, varighet **60 min** viser «Lagt inn (ikke testet)».
4. For å prøve en andre spesialpris: **1474 – HYZR 30 minutter – Ansatte: 10 kr** under Quickbutik > Kundegrupper > Ansatte > Legg til spesifikke priser. Hold produktet skjult/lager0; meld når gjort, og oppdater status i admin. Ingen betaling kan testes på dette stadiet; først fullført checkout-kobling må bygges.
5. Som intern utviklingsprioritet: Quickbutik variant batchsynk, pris i autentisert kasse, betalt webhook → én booking og Pushover uten duplikat. Markering av 121 statusrader alene løser ikke dette.
