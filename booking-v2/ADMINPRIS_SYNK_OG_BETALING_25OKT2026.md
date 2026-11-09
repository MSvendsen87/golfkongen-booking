# GolfKongen Booking 2.0 – adminpris, Quickbutik-samsvar og betalingskontroll
Dato: 25. oktober 2026. Branch: `booking-v2-preview-2026-10-24`.

## Brukerens arbeidsdeling
Eier legger selv inn de spesifikke kundegruppeprisene i Quickbutik, for å unngå CAPTCHA/automatikkostnad. Assistenten bygger resten. Ingen flere TinyFish-kjøringer er nødvendige. **Det er ikke noe verifisert/offisielt Quickbutik-endepunkt gjennom eksisterende Quickbutik-tilkobling som lar vår staging-admin skrive kundegruppespesifikke priser.**

## Gjennomført nå
1. **Priser** i `docs/index.html`: Lagre/endre gruppe + aktivitet + varighet i eksisterende `gk2_private.price_policies`. Under samme skjema ligger nå valgt Quickbutik-produkt-ID, status, «Kopier produkt-ID og pris», «Bekreft at prisen er lagt inn i Quickbutik», «Sjekk ordinærpris i Quickbutik», «Åpne Quickbutik». For gruppepris ligger ingen «sjekk faktisk Quickbutik-spesialpris»-funksjon, siden den ikke kan hentes fra tilgjengelig API. Bekreftelsesknappen registrerer kun eiers rapport, **ikke ekte kassetest**.
2. **Kun lesing av ordinære Quickbutik-priser**: `GET /admin/price-sync-check?resource=&group=&minutes=` i den eksisterende isolerte Edge-funksjonen `gk-booking-v2` v11. Krever Supabase Auth + owner allowlist + service_role RPC. Ved `group=public` hentes produktets ordinærpris fra eksisterende `cold-shadow-36dc` Quickbutik proxy og sammenlignes med den lagrede adminprisen, uten å skrive noe. Ved medlemsgruppe oppgis tydelig at spesialpris ikke kan leses. Ingen QB-secret i offentlig GitHub Pages.
3. **Utdatert spesialpris**: `gk2_admin_group_price_queue` returnerer `stale_price` når eier endrer gruppeprisen etter at den ble rapportert lagt inn, og nå `remove_override` dersom pris på gruppe nå er lik ordinærprisen og QB-tidligere særpris må slettes. Eieren må slette denne manuelt i QB og bekrefte i admin; da fjerner RPC statusrad. Migrasjon source: `booking-v2/sql/008_group_price_obsolete_override_guard_STAGING_ONLY.sql`. Databasetest utført med `BEGIN / ROLLBACK`: første 121 nødvendige priser, gjenkjenning av rabatt som må fjernes, sletting av status og rollback.
4. **Betalt ordre-kontroll (KUN KODE, IKKE LIVE)**: `booking-v2/supabase/functions/gk-booking-v2/payment-validation.mjs` sjekker autoritativ ordrestatus `paid`, ett riktig produkt, 1 stk, SKU med riktig start/slutt, riktig valuta og faktisk `amounts.paid`, ingen refundering og eventuell e-postidentitet. 14 lokale tester bestått. En reell tidligere ordre viste hvorfor rabatt må behandles: ordinær 800 kr med 98 % ansattrabatt ga faktisk betalt 16 kr. IKKE baser paid confirmation på varelinjens bruttopris.
5. **Betalings-RPC test med rollback**: Eksisterende `public.gk2_confirm_paid_slot` ble kontrollert under midlertidig opphevede release gates i en transaksjon med rollback. Testet bekreftet hold, 1 booking_confirmed-varsel, idempotent gjentakelse uten ekstra varsel, feil faktisk beløp fører til `paid_unallocated` med `manual_review`, samme betalingshendelse forsøkt brukt på annen booking avvises. **Dette var syntetiske transaksjoner; ingen faktisk Quickbutik-webhook/kjøp/varsel ble sendt.**

## Aktuell status (kan endres mens eier jobber)
- 33 Quickbutik-produkter koblet i staging, `publish_enabled = false` for alle, 0 aktiverte checkout planer.
- 264 Booking 2.0-prisrader, 121 forskjellige spesialpriser i utgangspunktet.
- Eieren registrerer selv status i admin. Ved siste sjekk var 33 `entered_reported`, 0 `checkout_verified`. **Status innebærer ikke at vi kan lese eller bekrefte det samme i Quickbutik.**
- Gammelt betalt hele lokalet 31. okt beholdt (24 fysiske 30-minutters claims). Min Bag 51 tabeller intakte; 0 public grants til private objekter.

## Begrensninger / hva som gjenstår FØR kunden kan booke
- Ekte Quickbutik-kasse: bookinghold → riktig variant → innlogget Quickbutik-gruppepris → faktisk betalingsbeløp. Ikke bygg en selvrapportert kundegruppe-parameter fra nettleseren.
- Staging-produktene har fortsatt skjulte/utsolgte tidsvarianter; bulk-synk-prototypen finnes i `booking-v2/scripts/quickbutik-hidden-variants-planner.mjs`, men ingen autorisert variant-jobb er deployet.
- Webhook `order.new`: autentiser leveringskilde og hent betalt ordre hos Quickbutik på server; send ren orde- og booking-ID til DB. Den rene `payment-validation.mjs` er IKKE koplet i Edge. Kasse/hold/webhook returnerer 503 inntil full ende-til-ende test og de 8 release gates er godkjent. Ingen Pushover endringer ennå.
- Fremtidig **automatisk Quickbutik-kundegruppeprissynk fra admin** krever en dokumentert støttet og autentisert skrivemetode. Ingen slik integrasjon er verifisert tilgjengelig. Adminpris-endringer blir liggende som endring i Booking 2.0 og må overføres manuelt til Quickbutik i mellomtiden.
- Etter reelt betalt testkjøp: bekreft kundegruppepris, riktig intervall/claims, betaling med gavekort/rabatt, ett Pushover-varsel, refundering, gammelt system/cutover og rollback.
