# Booking 2.0 – status 26. oktober 2026, etter videreutvikling

**Staging, IKKE kundelansert.** Eksisterende booking, Cloudflare, Pushover og Min Bag urørt.

## Ferdig i denne arbeidsøkten
- Quickbutik API-nøkkel i Supabase fungerer med orders(R). Reell ordre 3706 kunne leses fra admin; den er annullert og må aldri bekrefte en booking.
- Quickbutik V1 status er dokumentert: 0 unpaid, 1 paid, 2 done, -1 cancelled. Read-only admin-audit viser nå kartlagt ordrestadium uten å markere reservasjon som bekreftet.
- Ny ren betalingskontroll: `quickbutik-v1-payment-check.mjs` med status, serverbundet ordre-ID, aktivt hold, avtalte vilkår, kunde-e-post, riktig produkt/variant/SKU, totalsum, ingen uventede fraktkostnader, refusjoner og valgfri pilsett (0–6). Understøtter idempotent duplikat ved allerede bekreftet booking.
- `quickbutik-webhook-guard.mjs` krever sikkerhetshash og avviser duplikate query-parametre/ukjente hendelser.
- Supabase staging SQL installert: `010_checkout_order_binding_STAGING_ONLY.sql` (bind unikt ordrenummer + kunde + beløp + pilsett + vilkårstid på eksisterende hold), `011_strict_confirm_bound_quickbutik_order_STAGING_ONLY.sql` (ingen bekreftelse uten forhåndsbundet ordre), `012_lookup_bound_paid_checkout_STAGING_ONLY.sql` (kun service_role), `013_release_gate_probe_STAGING_ONLY.sql` (alle 8 må være sanne).
- SQL-binding/confirmation testet med midlertidige syntetiske reservasjoner i BEGIN...ROLLBACK: korrekt, idempotent, feil ordrenummer avvist, utløpt hold gir paid_unallocated + manual_review. Ingen testdata ble stående.
- Supabase Edge `gk-booking-v2` oppgradert til **v17** med bevart admin, availability og booking-sperre. Signert `/webhook/quickbutik`-kode finnes, men krever BÅDE `GK2_WEBHOOK_ENABLED=true` og alle 8 release gates. Begge er av inntil verifisert produksjonsflyt. Ingen live penger eller booking påvirket.
- GitHub Actions betalingsvalidator + webhook-vakt er grønn etter siste kodeendringer.
- Variantpilot i Quickbutik på skjulte produkter: 1474 / variant **282529** (2026-11-02 10:00–10:30, 90 kr) og 1483 / variant **282530** (2026-11-02 10:00–14:00, 600 kr). Begge er kontrollert via nytt produktoppslag: parent `visible=false`, variant `hidden=true`, `stock=0`, `preorder=false`, `allowMinusQty=false`. Piloten beviser MCP-støtte også når produktet opprinnelig ikke hadde tidsvalg.
- Gamle Quickbutik bookingprodukter 1316,1317,1320,1349 kontrollert read-only: eksisterer fortsatt med 408–1530 datovariantelementer fra 1. nov til 4. des, alle rapportert lager>0 i oppslaget. Dette utelukker IKKE eksisterende betalte eller blokkert tidsrom; legacy-ordrer må avstemmes før overgang.
- Stagingstatus etter kontroll: 1 eksisterende bekreftet reservasjon (31. oktober), 24 claims, 0 payment_events og 0 outbox, 0 publiserte nye produkter. Ingen syntetiske test-rader igjen. Alle 8 release gates fortsatt false.

## Viktige blokkerere – skal IKKE omgås
1. **Kundekasse:** Ingen ferdig, autoritativ `hold -> Quickbutik checkout` som binder generert ordrenummer *før* betaling, opprettholder Quickbutik-gruppepris og gyldig rabattsum. API-nøkkelen har foreløpig ORDERS(R), ikke dokumentert ORDERS(W). Ikke be eier legge inn 121 priser på nytt. Test gruppepris med eierens innlogging og reell (ikke betalt) kasse før ny testbetaling.
2. **Webhook i produksjon:** Separat `GK2_WEBHOOK_SECURITYHASH` er ikke satt/testet mot faktisk Quickbutik order.new. Ikke aktiver `GK2_WEBHOOK_ENABLED` eller Quickbutik webhook før sikker callback, bestillingskobling og kansellering er implementert og testet.
3. **Pushover:** gammel `nameless-feather-dbf3` Worker sender for legacy produkt-IDer, ikke nye 1474–1506. Ny outbox må sendes via sikker idempotent notifier, og gammel rute må deaktiveres/tilpasses uten doble varsler. Ikke kopier tokens fra gammel kode.
4. **45-dagers varianter:** 2 kontrollerte piloter er ikke en full rolling calendar. Gammel V1 `variants.add` skapte `hidden=false` og bulk-workflow er fortsatt med vilje stanset. Lag adapter som oppretter med `hidden=true,stock=0`, etterleser hver variant og stanser/rapporterer avvik.
5. **MVA/frakt/vilkår/takk-side**, legitime gammelordrer, kalenderblokker, samtidighets- og live-kjøpstest gjenstår.
6. **Ikke slå av fungerende gammel booking** før safe cutover.

## Sikkerhetsregel
Dersom serverbetaling kommer etter utløpt hold eller V1 API ikke returnerer tilstrekkelig verifiserbart ordreinhold: manuell vurdering, aldri bekreftet kalender eller ordinær Pushover.
