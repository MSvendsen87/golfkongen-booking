# Booking 2.0 – første fase igangsatt 25. oktober 2026

**Beslutning:** Erstatt bookingmotor og admin-kalender **før** offentlig `/aktiviteter` og de gamle checkoutsidene byttes. Behold Quickbutik-betaling, kundegrupper og Pushover til ny testet integrasjon er klar. Ingenting er publisert til live.

## Funn ved oppstart
- Eieren ønsket pause i offentlig booking ved behov og oppga ingen bookinger. Read-only Supabase-replika og autoritativ Quickbutik-ordre **3662** viser imidlertid **betalt leie av hele lokalet 31.10.2026 kl. 18:00–22:00**. Denne MÅ bevares og sperre HYZR og begge dartbaner.
- Gammel Cloudflare `gk-booking-admin` har cron `0 3 * * *` og oppretter/vedlikeholder timesbaserte bookingvarianter. Det kan kollidere med en ny halvtimekalender. **Ikke deaktiver nå**; koordiner endring ved faktisk cutover.
- Gammel Make → `nameless-feather-dbf3` → Quickbutik → Pushover fortsetter. Ikke bygg parallelt push før verifisert.
- Gammel Supabase `gk_booking_admins` har seks kontoer. Ny separat admin har bare `post@golfkongen.no` og `kristoffer.mrk@gmail.com`.

## Kode som er utviklet nå, ikke dobbeltarbeid
Tidligere `gk2_private` SQL/Edge staging-kode er **gjenbrukt**; ikke skrevet fra bunnen. Ny sikkerhetsbeskyttelse `release_gates` legges inn i den opprinnelige `001_private_schema`-SQL **før** hold-funksjonen: åtte default-`false` flagg for
`legacy_paid_orders_verified`, `legacy_rules_verified`, `customer_group_prices_verified`, `checkout_paid_webhook_verified`, `pushover_end_to_end_verified`, `admin_auth_verified`, `concurrency_verified`, `legacy_cron_switch_verified`.

`gk2_hold_slot` avviser enhver reservasjon når ett eller flere flagg er `false`, selv om Edge-featuren skrus på. Dette er dobbel lås sammen med eksisterende `GK2_HOLD_ENABLED`.

**Arbeidsfil (samtalevedlegg):** `GolfKongen_Booking2_FASE1_SIKRET_STAGING_25okt2026.zip` inneholder oppdatert SQL, eksisterende staging backend/frontend, og 10 nye statiske kontrakttester (10/10 bestått). Eksisterende 7 Node-testfiler bestod på nytt, men dette er fortsatt **ikke PostgreSQL-/checkout-integrasjonstesting**.

## Streng publiseringsplan
1. Opprett separat Supabase staging/test-database og kjør gated schema; test virkelig concurrent booking samt Supabase Auth-adminkontoer. Ingen SQL i delt prod før testing.
2. Importer og dobbeltsjekk eksisterende betalinger og stengeregler (spesielt 31. oktober), uten å ta med ubetalte/annullerte ordre.
3. Koble 30/60/90/120+ min til en verifisert Quickbutik handlekurv/checkout som respekterer ansatte 98 %, Team GolfKongen, andre kundegrupper, rabattkoder og gavekort.
4. Først deretter koble betalt-ordre-bekreftelse og eksisterende Pushover mot samme booking-ID; ett push per bekreftet booking, aldri per halvtime.
5. Når alt er testet: midlertidig steng alle gamle direkte bookingsider og produkter **samlet**, stopp gamle variant-cron kontrollert, bytt nettsidens bookingwidget og aktiver gated motor. Backup/rollback klar.

**Viktig:** Å skjule `/aktiviteter` alene stopper **ikke** direkte booking fra de andre sidene eller produktene. Behold eksisterende system i drift til en reell samlet bookingstengning er kontrollert.

**Status:** Fase 1 kildekode klar som lokal stagingpakke; ny databasemigrasjon ikke kjørt, og checkout ikke aktivert.
