# Klubbkveld Booking 2.0 – 29. oktober 2026
## Avtalt med eier
Aktivt Dartklubb-medlem. E-postkode for å bekrefte eierskap til medlemsadressen er valgt av eier i dialog.
Torsdag 19–22, 50 kr per person, 10 plasser. Ett valgfritt pilsett +25 kr, maksimalt åtte leiesett.
Én plass per medlemsadresse per kveld. Ikke gjestepåmelding på andres medlemskap.
Alle aktiviteter (HYZR, dart A/B, hele lokalet) sperrer klubb ved overlapp, og klubb sperrer alle disse.
Påmelding stenger 18:30. Eksisterende bookinger før 19:00 kan stå.
Felles Nuki-kode per dato, gyldig 18:45–22:15 Europe/Oslo. En avbestilling bevarer koden for øvrige betalende; siste avbestilling tilbakekaller.
## Implementasjon
gk-booking-v2 med club-engine.mjs. Private Postgres-tabeller, RLS og service-role-only RPC.
Medlemslisten leses med signert server-til-server-kall til det eksisterende Google-arket. Kun eksakt e-post, ingen navnefallback og ikke Ansatte alene.
Supabase Auth generateLink gir OTP, sendt via eksisterende Resend-domene. verifyOtp etablerer brukerøkt. Tre utsendelser per adresse per time, 20 per IP-hash.
Egen Quickbutik-variant på produkt 1507 per hold, 50 kr, antall én. Bare ved et faktisk bookingforsøk opprettes varianten. Leie bruker 1318.
SKU GK2-CLUB-YYYY-MM-DD-<enrolment uuid uten bindestreker>. Oppretter ved lager null, åpner én, kontrollerer readback, rydder ved bekreftelse/kansellering/utløp.
Åpent/ukjent checkoutlager fortsetter å sperre tidspunktet til relocking er bekreftet. Normal og klubb bruker samme dato-advisory-lock.
Betalt webhook henter ordren uavhengig fra Quickbutik, krever én klubbplass og eventuelt ett pilsett, NOK, null frakt, ingen refusjon og nøyaktig 50/75 kr. E-post må samsvare med verifisert hold.
Bekreftelse og adgangskode sendes først når Nuki-autorisasjonen er lest tilbake med riktig tidsvindu. Kryptert kode lagres én gang per kveld/generasjon.
Arbeid utføres av den eksisterende minuttjobben. Ingen ny scheduler. Ingen Quickbutik-/Nuki-kall når det ikke finnes arbeid.
Uavklart Nuki-oppretting prøves ikke blindt på nytt; leses tilbake og meldes til post@golfkongen.no ved stans.
Backendversjon ved publisering: 67.
## Aktivering / drift
Legacy LDK Tilgang 1322 beholdt skjult. Åtte gjenværende dato-varianter 29. oktober–17. desember satt skjult/lager null. Ingen historiske ordre endret.
Produkt 1507 er publisert; seks gamle dato-varianter er fortsatt skjult/lager null og ikke brukt av ny checkout.
Ny kilde ligger både i docs/booking/clubgate-v2.js og MSvendsen87/ldk-clubgate/clubgate.js.
Quickbutik Dartklubb loader må peke på ny pinned commit før kundesiden bruker ny kode; eksisterende side lastet f2e1c1d ved siste avlesning. Ny pinned commit er 34aab46.
SQL booking_settings.club_enabled er lanseringsbryter; aktiveres ved klargjort backend. Kundesiden må i tillegg bytte loader til 34aab46.
## Verifikasjon
Lokale enhetstester for medlemskontroll, ordrelinjer, variantlager, delt Nuki-kode, utsendelse etter readback og tilbakekalling.
Transaksjonelle SQL-tester med ROLLBACK: begge konfliktrettinger, ti plasser, grense kl19, avbestilling, leiebeløp, idempotens, foreldet checkout og worker-/OTP-låser.
Live HTTP: kalender200, uautorisert medlemsrute403, ugyldig e-post400. Eksisterende minuttjobb har kjørt den nye vedlikeholdsfunksjonen.
Sikkerhet: nye private tabeller har RLS, anon kan ikke kjøre RPC-ene. Kun eksisterende INFO om policyfrie private tabeller og eksisterende passordvarsel i advisor.
Browser-testscenario er inkludert, men ikke kjørt ferdig: Chromium manglet og nedlasting var utilgjengelig i arbeidsmiljøet.
## Må testes med eier
Ekte OTP mottak og innlogging, oppretting av unik variant i Quickbutik, handlekurv på mobil, faktisk betaling 50/75 kr, callback og Nuki-readback.
Kontroller rabattgrupper i kassen: klubbplass skal koste 50 kr; nåværende ansatt-/butikkrabatter må ikke redusere klubbprisen eller eventuell avtalt leiepris. Ingen rabattregler er endret her.
Ingen live Nuki-autorisasjon eller kundemelding er opprettet under tekniske tester; ekte flyt gjenstår.
Fysisk test av felles kode og tidsvindu gjenstår.
Quickbutiks native kvittering beholdes for klubbordre. Eksisterende Booking2-takksider og normale bookinger er ikke omdirigert av klubbscriptet.
