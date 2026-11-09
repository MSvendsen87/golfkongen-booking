# GolfKongen – felles kontrakt Booking 2.0 ↔ Nuki Keypad
Dato: 26. oktober 2026. Dette er STAGING, ingen live adgangskoder sendt.

## Beslutning
Nuki skal IKKE gi kunder adgang direkte fra en Quickbutik `order.new` uten bekreftet reservasjon. Booking 2.0 er autoritativ for valgte tider, konfliktkontroll, betalt ordre og kansellering. Etter gk2_confirm_paid_slot returnerer `confirmed`, legges to uavhengige oppgaver i `gk2_private.notification_outbox`: `booking_confirmed` (Pushover) og `nuki_access_requested` (dørkode). Begge har UNIQUE(reservation_id,kind), og oppstår transaksjonelt.

## Allerede installert og testet
- SQL på Booking 2.0-grenen: `booking-v2/sql/014_nuki_access_event_on_confirm_STAGING_ONLY.sql`.
- Installert i eksisterende isolerte Supabase-staging `gk2_private`; ikke Min Bag og ikke gammelt bookingsystem.
- BEGIN/ROLLBACK test bekreftet akkurat én Nuki-oppgave ved `confirmed`, ingen ved `paid_unallocated`/utløpt hold, og at gjentatt betalingshendelse ikke lager doble hendelser.
- Ingen offentlig Nuki-endepunkt, ingen kundeutsendelse, ingen kode/lock-API kalt. Alle åtte release-gates fortsatt false.

## Nuki-grenen – må tilpasses før produksjon
Eksisterende separat gren `feature/nuki-booking-access-20261026` inneholder `nuki-access/worker.mjs`, `booking-access.mjs`, `schema.sql`, `README.md`. **Nåværende worker ingester både Quickbutik webhook og siste betalte ordre direkte**, slik at den kan gi kode uten en validert gk2-bekreftelse. Ikke aktiver `ACTIVE=true` eller sett egen offentlig ordre-webhook til Nuki-worker før dette er endret. Denne uavhengige kilden må fjernes/blokkeres for nye Booking 2.0-produkter.

## Foreslått minimal sikker bro
- Egen server-authentisert Booking 2.0 outbox-consumer, ikke browser, som bare henter `nuki_access_requested` med matchende `reservations.status='confirmed'`, ordrenummer, UUID, dato, start/slutt, kunde-e-post, ressurs og bekreftet betalingsgrunnlag. Ingen tilgang til annet privat schema.
- Consumerens dedupliseringsnøkkel er `reservation_id:nuki_access_requested:v1`. Etter vellykket Nuki-synk må dette kvitteres; timeout/ukjent utfall krever etterlesning, ikke en ny tilfeldig kode.
- Nuki-kode: unik seks-sifret uten 0, ikke startet på 12, 5 minutter før start til slutt, tidsone Europe/Oslo med DST-kontroll.
- Bekreft Nuki-autorisering med GET. Nuki API-operasjoner er asynkrone; API GET-bevis er ikke fysisk bevist Keypad-synk. Send kode separat fra Quickbutik e-post, etter verifisering og fysisk pilot. Ikke lov åpning uten test på åpen dør.
- Avbestilling/refusjon og manuell reallokering må først verifiseres; trekk tilbake Nuki autorisering og oppdater sendestatus. Ikke opprett kode til ubetalt/expired/cancelled/paid_unallocated eller enkel pilsett-vare.
- Pushover og Nuki sendes som uavhengige oppgaver; feil ved Nuki skal ikke opprette ekstra booking eller duplikate Pushover.

## Aktiveringssperrer
- Ikke del Nuki token, Quickbutik token, Resend nøkkel eller krypteringsnøkler i chat eller GitHub.
- Behold fungerende gammel booking til fullstendig overgang; gamle Quickbutik-bookinger må verifiseres og migreres/reconciles før de også får Nuki-kode.
- Test Quickbutik -> bind -> validert betalt ordre -> gk2-confirmed -> Pushover + Nuki outbox -> kode -> Resend -> fysisk keypad -> kansellering/revokering.
- Gå gjennom mekanisk dør/lås og fysisk åpning. Cloud-verifisert kode er ikke ensbetydende med fungerende opplåsing.
