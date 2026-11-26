# Booking 2.0 – Pushover og Resend realtest, 27.10.2026

## Bekreftet
- Pushover: eier deaktiverte øvrige gruppemedlemmer midlertidig og sendte selv fra «GolfKongen Booking 2.0» til gruppen «Golfkongen». Testvarselet ble mottatt straks på egen telefon.
- Supabase `gk-booking-notifier` var konfigurert, men automatisk utsending var deaktivert. Tidligere read-only Nuki/Web API, Keypad og gruppevalidering bestod.
- Resend: ÉN isolert test ble sendt fra `booking@golfkongen.no` til eierkontoen med emne «TEST – GolfKongen Booking 2.0 e-post». GitHub run `40483255874` bestod; `gk2_private.owner_email_tests` viser `sent`, unik test-id; Resend-kontoen rapporterer `delivered` kl 09:45:56 UTC. Ikke påstå at e-post er lest.
- Testen var isolert fra booking/outbox/kundeordre. Ingen dørkode, ingen reell booking, ingen kunde varslet. `gk2-owner-resend-test` er én-gangsbeskyttet; ingen automatisk retry.
- Supabase `gk2_private.checkout_product_plans where publish_enabled` var 0, notification_outbox 0 ved testen.

## Neste obligatoriske steg
1. Eier er fysisk ved låsen med døren åpen. Bare da: opprett en kort tidsbegrenset kode gjennom Nuki Web API, kontroller GET readback, test på Keypad, og slett koden/verifiser tilbakekalling. Opprett aldri en stående testkode dersom ingen kan teste eller kontrollere låsen.
2. Gjennomfør komplett reell Quickbutik-kasse-test, database-hold, korrekt kundegruppepris, pilsettleie, webhook til betalt reservasjon, Pushover-gruppevarsel én gang, Nuki adgangskode via e-post, fysisk test, avbestilling/refusjon og tilbakekalling.
3. Fullstendig kontroll av 33 produkter × rullerende 45 dager, overlapping og eksisterende bookinger, alle release-gates, før kundesalg aktiveres.
4. Etter test, gjenaktiver de fem øvrige Pushover-gruppemedlemmene når eier ønsker ordinær varsling.

## Offentlig kontroll
- GitHub: https://github.com/MSvendsen87/golfkongen-booking/actions/runs/40483255874
- Ikke logg eller publiser hemmelige API-nøkler eller dørkoder.
