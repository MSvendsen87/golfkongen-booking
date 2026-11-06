# Booking 2.0 – Staging kandidat, 25. oktober 2026

## Hvor ligger faktisk kode?
Samtalens nedlastbare pakke: **GolfKongen_Booking2_STAGING_25okt2026.zip**. Koden er ikke publisert. Gjenbruk denne pakken og de eksisterende filene i utviklingsgrenen fremfor å skrive alt om fra bunnen av.

Pakken inneholder:
- `frontend/booking2_design_med_vilkar.html`: eksisterende design, HYZR- og dartillustrasjoner fra eier, sjekkbar vilkårs-popup, skokrav og mobiltilpasning. **Demo, ikke ekte betalt booking**.
- `frontend/public_widget_STAGING_ONLY.html`: offentlig widget med reell API-basert dagoversikt (når backend er konfigurert); **checkout sperret som standard**. Peker ellers til dagens fungerende booking.
- `frontend/admin_STAGING_ONLY.html`: egen admin for kalender, sperringer/åpning, åpningstider, prisutkast, medlemsendringsforespørsler og turneringsutkast. Krever Supabase Auth og Edge-API. **Ingen adminbruker kan få tilgang til ekte data uten serverautorisering**.
- `sql/001_private_schema_DONT_RUN_IN_PROD.sql`, `002_admin_and_calendar_DONT_RUN_IN_PROD.sql`, `003_admin_extended_DONT_RUN_IN_PROD.sql`: isolert nytt `gk2_private`-skjema, fysisk unik halvtimeclaim, transaksjonslås, idempotens, separate administrative RPC-er, audits, RLS og outbox.
- `supabase/functions/gk-booking-v2/index.ts`: API-kandidat med serververifisert Supabase Auth JWT, to e-poster som admin, og checkout/webhook **deaktivert** inntil leverandørverifisering.
- `tests/*.test.mjs`: 157 eksisterende offline-kontroller, alle bestått.
- `tests/test_release_contract.py`: 21 nye strukturelle kontrakttester, bestått.

## Funn om eksisterende drift
- Den eksisterende `gk_booking_admins` i produksjons-Supabase har **seks aktive** kontoer. Eier vil at ny admin skal være tilgjengelig for **kun `post@golfkongen.no` og `kristoffer.mrk@gmail.com`**. Derfor bruker Booking 2.0 en helt separat privat admin allowlist, og gammel tabell ble IKKE endret.
- Quickbutik 1316/1317/1320 har timesvarianter. Nye 30-minuttersslots kan ikke legges i handlekurv på en sikker måte uten en testet betalingsadapter.
- Quickbutik har API og webhooks: https://quickbutik.com/no/hjelp/hvordan-fungerer-quickbutik-sin-api-og-hvor-kan-jeg-lese-mer ; autoritativ ordrehenting må brukes for signert/verifisert betaling.
- Cloudflare Worker for gammel ordre/Pushover er ikke fullt kartlagt; eksisterende Pushover må bevares uten doble varsler.
- Ansatte har 98 % på booking, øvrige seks gruppefordeler oppgitt av eier er dokumentert i `PRISGRUPPER_OG_RABATTER.md`.
- Vilkårs-popup fra eksisterende dart-booking er bevart i frontend-demo som en obligatorisk bekreftelsesprosess. Innesko/sokker ved HYZR og dart.

## Hva kan publiseres i dag?
**Kun designoppdateringen for `/aktiviteter`** fra `GolfKongen_Aktiviteter_nye_bilder_KLAR_FOR_QUICKBUTIK.html`, mens alle lenker fortsatt går til dagens virkelige bookingsider. Koden bruker begge eierens Google-miniatyrbilder (med fallback til GolfKongens produktbilder), markerer HYZR «Åpner snart» og nevner DartCounter samt innesko/sokker. Bilde-URL-ene er potensielt flyktige og må erstattes med godkjente originaler før fast bruk.

## Uteståtte lanseringsstoppere
- Ingen databasemigrering kjørt i staging/produksjon. Koden har ikke fått reell Postgres concurrency-/RLS-test. Bruk **ikke** SQL på delt produksjon før isolert test.
- Ingen Quickbutik checkout/webhook eller kundegruppeverifisering koblet til nye halvtimeslots.
- Ingen Pushover-sending koblet til ny outbox.
- Ingen produksjonsautorisert Google Sheet/Cloudflare/Quickbutik medlems-CRUD.
- Ingen HYZR-tid er åpnet; tidligere stengeregler til og med 31. oktober må bevares ved migrering.
- Ikke fullført reell flytting/endring av betalte bookingtider fra admin, eller synkronisert HYZR scoreføring.
- **Ikke publiser** de nye kundesidene med testdata eller admin-skjemaet som reell booking før punktene over er fullført.

## Neste reelle steg
Først inspeksjon/test av Quickbutik API/webhooks og faktisk nåværende Pushover. Deretter isolert Supabase staging + kassekopling, import av eksisterende betalte bookinger/regler, og riktig kundegruppepris og kontoautorisasjon. Til slutt full test og kontrollert utskifting av live booking. Ingen produksjonsendringer foretatt i denne økten.
