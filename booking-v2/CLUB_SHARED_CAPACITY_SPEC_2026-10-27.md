# Booking 2.0 – oppdatert klubbmodell 27.10.2026

## Eiers beslutning (erstatter tidligere tirsdagsfrigivelse)
- **Ingen kalenderbasert prioritetsblokkering torsdag 19–22.** Timene er åpne for ordinær dartbooking dersom ingen klubbplass er reservert.
- **Begge veier, atomisk:** Dersom noen har gyldig hold/betalt booking for dart A eller dart B som overlapper torsdag 19–22, skal klubbkveld ikke kunne reserveres/betales. Dersom minst én klubbplass er gyldig hold/betalt, skal dart A og B samt venue være utilgjengelig i dette tidsrommet. HYZR alene kan fortsatt bookes.
- **Klubbkveld:** Hver torsdag kl 19–22, maks 10 deltakere, **50 NOK per person**. 1–10 plasser må reserveres atomisk og allokeres mot samme daglås som ordinære claims. Bekreftede seter skal ikke mistes ved utløp av andre holds.
- **Kun adgangsberettigede kunder** skal kunne bestille klubbkveld. Admin for eier må kunne se, legge til, deaktivere og endre hvem som er berettiget, med revisionslogg, sikker verifisering av kundens ID og uten at kundeliste eksponeres i offentlig API.
- **Én eneste bestillingsmotor: Booking 2.0.** Eieren har nå eksplisitt besluttet at gammel klubbkasse/gamle bookinglenker skal avvikles fra offentlig kjøpsflyt ved kontrollert cutover. Alle ordinære dartbookinger og klubbpåmeldinger bruker de samme atomiske kravene og den samme Quickbutik-betalingsbindingen. Første servergodkjente, aktive hold vinner – ikke første klikk eller senere fullført betaling. Hold må beskyttes mens betalingsforsøket er aktivt; avbrutt/utløpt hold frigjør plassen trygt. Eksisterende betalte bookinger skal bevares/migreres som blokkeringer før gammel kasse fjernes. Ingen blind sletting av ordre/produkt/historikk.
- Ikke åpne Booking 2.0 eller endre Min Bag-produksjon før følgende er verifisert.

## Kontrollert omkobling av offentlig booking
- Finn alle aktive eldre bookinglenker og klubbprodukter; sørg for at de ikke kan kjøpes via direkte handlekurvlenker etter cutover. Ikke bare skjul en knapp.
- Les og migrer/registrer alle fremtidige bekreftede gamle reservasjoner som konfliktblokker før ny betaling aktiveres.
- Bytt alle lenker på /aktiviteter og andre bookinginnganger til Booking 2.0 først etter at ende-til-ende betaling og bekreftelse er testet; steng gammel kjøpsvei atomisk eller bruk vedlikeholdssperre i overgangsvinduet.
- Ikke fjern tidligere ordre, historikk eller medlemskilde. Gamle Quickbutik-varianter må ikke forbli direkte kjøpbare etter omkobling.

## Teknisk implementasjonskrav
1. Fjern den statiske `club_priority_blocked` fra de nye kalendervurderingene og holdreglene **samtidig som** atomiske seter/claims håndheves. Aldri fjern statisk blokk før en pålitelig erstatning eksisterer.
2. Lag private tabeller `club_eligibility` (verifisert customer_id, aktiv, admin audit) og `club_enrolments` (slot_date, seats, status, idempotency_key, checkout/order binding, hold expiry). Ingen anon/authenticated tilgang til tabellene; endast server rolle og administrasjon gjennom eierautorisert backend.
3. `club_hold` tar samme `pg_advisory_xact_lock(hashtextextended(day::text,0))` som `gk2_hold_slot`. Avvis dersom `claims` for dart_a/dart_b i 19–22 overlapper (inkluder aktive checkout leases). Sum bekreftede og gyldige holds ≤ 10. Idempotent gjenbruk av nøkkel.
4. `gk2_hold_slot` på torsdag 19–22 for dart A/B/venue avvises under daglåsen hvis klubbholds/betalte påmeldinger finnes. Kalender viser samme regler. En klubbbooking må ikke reservere ett enkelt dart-slot; den bruker en gruppesete-sperre med begge dartbaner låst.
5. Betaling: hver klubbordre på 50 NOK per plass må knyttes til gyldig setereservasjon og verifisert betalt Quickbutik-order før `confirmed`. Webhooks er idempotente; kansellering tilbakefører kapasitet og stenger eventuelt adgang. Aldri send Nuki-kode ved kun opprettet handlekurv.
6. Admin: owner-auth kontroll før enhver lese- og skriveoperasjon; verifiser e-post/Quickbutik-kunde-ID sikkert; kun admin kan administrere tilgang. Ingen navn/mailer publiseres i GitHub.
7. Tester må dekke 0/1/9/10 seter, simultant siste sete, dart→klubb og klubb→dart, venue begge veier, HYZR fri, overlap ved 19:00 og 22:00, gyldig vs utløpt hold, forsinket betaling, idempotens, DST og tilbaketrekking av tilgang.

## Status
**Kun spesifikasjon**, ikke migrert eller aktivert. Tidligere 113 tester gjelder den gamle prioriteringsmodellen, og teller ikke som godkjenning av denne endringen. Ingen kunde kan prøvbetale det nye klubbproduktet før det faktisk er koblet til checkout, kalender og admin.
