# Booking 2.0 – status etter reell Vipps-kassetest (26.10.2026)

**Status: STAGING / IKKE PRODUKSJONSKLAR.**
**Leveranse:** Dokumentasjon og kode i [draft PR #1](https://github.com/MSvendsen87/golfkongen-booking/pull/1), ingen merge/publisering av bookingsystemet.

## Gjennomført uten dobbeltarbeid
1. Gjenbruk av eksisterende Booking 2.0 staging database `eadgdcimcmfyuicizboo`, `gk2_private`; ingen ny Supabase-instans og ingen endringer i Min Bag eller gamle bookingtabeller.
2. Alle 33 Quickbutik-varighetsprodukter 1474–1506 eksisterer og er i siste butikkoppslag **skjult**. Betaltestprodukt 1477 ble skjult med `update_product(visible:false)`; test-SKU `GK2-TEST-ONLY-20261026-1H` (variant 282442) fikk `hidden=true`, `stock=0`, `preorder=false`, `allowMinusQty=false` etter avsluttet kjøp.
3. Ordre **3706** var først `paid` (innlogget Ansatte, varelinjepris 15 kr, rabattkode 30 %, 10,50 kr faktisk betalt på testtidspunktet), men nyere autoritativ ordrestatus er **`voided` og `cancelled`**. Event `cancelled` kl. 2026-10-26T00:56:11Z. `paidAt` er fortsatt satt. Ikke importer testkjøp til bekreftet booking; ikke anta `refunds=[]` beviser refundering.
4. Eksisterende `payment-validation.mjs` ble forbedret til å akseptere valgfritt **pilsett 1318** på samme ordre, men avvise ugyldig antall (0–6), ukjente ekstra varer, annullerte ordre, feil SKU, feil kunde og uverifisert effektiv pris. 16 tests lagt til.
5. Eksisterende `cloudflare/booking-v2-pushover-map.mjs` krever nå verifisert **confirmed booking/outbox** før melding kan formateres. Raw betalt webhook/testvare 1477 alene gir aldri `booking`-push. 9 tests lagt til.
6. GitHub Actions for betalingsvalidator og Pushover-adapter: bestått, se [testkjøring](https://github.com/MSvendsen87/golfkongen-booking/actions/runs/40247936464). CI gjelder **ren offline-kode**, ikke en ekte booking.
7. Draft PR #1 holder utviklingen isolert fra `main`; ingen produksjonsmerge.
8. Offisielle Quickbutik-kilder bekrefter `order.new` er **ny betalt ordre** og at produkt-/variant-bulk API ikke dokumenterer støtte for skjult variant på add. `quickbutik-rolling-sync.mjs` hindrer derfor fortsatt masse-SKRIV før trygg etterbehandling er testet.

## Det som fremdeles sperrer aktivering – ikke skjul dette
- **0 av 33** checkout_product_plans er både `is_ready` og `publish_enabled`; **alle åtte** `release_gates` står `false` (read-only kontroll 26.10).
- Installert Edge-funksjon `gk-booking-v2` v13 har eksplisitt **HTTP 503** på `/hold`, `/checkout` og `/webhook/*`. Verken betaling eller ordrebekreftelse integrert for ekte tidsbestillinger.
- `gk2_private.group_price_entry_status` har 121 `entered_reported`; kun Ansatte/HYZR/60 ble observert i ekte kasse, og testen ble senere annullert. Resten er meldt registrert av eieren, men ikke teknisk checkoutverifisert. **Ikke krev at eier skriver dem inn igjen.**
- 45 dagers rullerende kalender finnes i DB, men nødvendige Quickbutik dato-/starttidsvarianter for alle 33 varigheter er IKKE opprettet/verifisert salgbare. Rullende variantsynk er bevisst skrivesperret etter pilot som opprettet varianter med `hidden=false` som standard. Ingen masseaktivering.
- **Eksisterende Pushover/Cloudflare Worker har ikke oppgradert ruting for nye 33 IDer, og faktisk bekreftet booking→push er ikke end-to-end-testet.** Draft-mapping er kun kildekode.
- Før betaling må server-autorisert kundemedlemskap og riktig gruppepris identifiseres, Quickbutik-validert forventet beløp (og evt. rabattkode, gavekort, pilsett) må kontrolleres uten å stole på browser.
- Salg krever riktig Quickbutik fraktløsning for digital booking (ingen uønsket 45 kr frakt), korrekt MVA for booking (testvare var taxRate=0), bookingvilkår signert/serverlagret og riktig takk-side.
- Gamle bekreftede bookinger, stenginger og vedlikeholds-Cron må overføres/testes; kontrollert cutover og rollback.

## Neste reelle implementasjonsjobb
1. Implementer og test ETT autorisert staging-API for atomisk tids-hold→én korrekt varighetsvariant i Quickbutik checkout; binding av booking-ID til autoritativ order.new; påfølgende idempotent confirmed.
2. Tilpass Pushover/Make kun etter ekte confirmed booking. Bevar gammel notifier til cutover og håndter ingen dobbeltvarsling.
3. Bygg trygg batch-variantflyt og kontrollert publisering for 45 dager, med etterverifisering og fail closed.
4. Gjennomfør én *ny*, reell end-to-end booking først etter at 1–3 fungerer. Nåværende annullerte 3706 demonstrerer bare kasse, ikke kalender/push.
5. Aktiver release gates **én og én med verifiserte bevis**, deretter 33 produkter og kontrollert frontendswitch.

**Viktig:** Ikke lov brukeren at alt er klart før status over er verifisert. Ingen ny reell betaling er nødvendig *nå*.
