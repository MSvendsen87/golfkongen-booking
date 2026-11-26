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


## Tillegg 26.10 – ordre 3702 og V1-brutto/netto
- Eier kontrollerte rå V1-skjema i staging: `total_amount` finnes, `total_pay_amount` mangler; `shipping_amount`, `currency`, `customer.email` og SKU finnes. Status `fulfilled`.
- Quickbutik tilkoblet ordre-API gir autoritativ normalisert informasjon om ordre 3702: varebeløp 800 NOK, rabatt 784 NOK, faktisk innbetalt 16 NOK. Derfor er det **usikkert å behandle V1 total_amount som faktisk betalt beløp**, særlig ved rabattkode.
- Ny strengt fail-closed `quickbutik-v1-payment-check.mjs`: Ved manglende `total_pay_amount` kan vi bare beregne `total_amount - discount_amount` når begge felter finnes som gyldige NOK-strenger. Mangler rabattfeltet eller totalen, avslås automatisk bekreftelse. Hvis `total_pay_amount` finnes brukes den, og ev. brutto/rabatt kryssjekkes. CI testet scenario 800–784=16, ugyldige felter og ubetalte/kansellerte ordre. Dette er ikke bekreftelse på at 3702 råfelter har akkurat disse verdiene.
- Owner-only ordre-audit viser nå de rå finansfeltene som faktisk finnes: `total_amount`, `discount_amount` og `total_pay_amount` – ingen kundeopplysninger eller hemmelige betalingsfelter. Supabase Edge staging nå v21, fortsatt sperret for betalte nye bookinger.
- Flere ekte skjulte zero-stock pilotvarianter opprettet og etterlest: Dart A 1475 / 282531, Dart B 1476 / 282532 og hele lokalet 1498 / 282533, alle 2. november kl 10, i tillegg til HYZR 1474 og 1483. Foreldre usynlige og varianter `hidden=true`, stock0, preorder false.
- **Neste minimale eierhandling:** Oppdater booking-admin, fanen Kassekontroll, les ordre 3702 på nytt og oppgi bare `Rå total_amount`, `discount_amount` og `total_pay_amount` fra den nye linjen. Dette avgjør om V1 kan verifisere nettobeløpet eller om annen kilde er nødvendig. IKKE åpne Quickbutik bookingproduktene eller Nuki.
- Rullerende V1-bulkvariantjobben er fortsatt med hensikt uten skriverett; V1 dokumenterer ikke skjult felt for `variants.add`, så automatisk bulk må ha testet sikker variantopprettelse og readback, ikke bare flere enkle MCP-piloter. Anslått 25,785 varianter for 45 dager/33 varigheter.
