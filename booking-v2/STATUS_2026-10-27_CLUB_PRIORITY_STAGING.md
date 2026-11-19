# Booking2 – klubbprioritet implementert i staging 27. oktober 2026

- Eier har bedt om at innlagte kundegruppepriser anses som OK; dette er ikke lenger en blokkering som krever support. Eieren tar siste kontroll i kassen. Tidligere status om 29 variantbindinger er beholdt som historikk, ikke en ny oppgave til eieren.
- Migrasjon gk2_club_priority_guard installert bare i staging eadgdcimcmfyuicizboo. Ny privat club_capacity-tabell med RLS, ingen anon/authenticated-tilgang, kun service_role SELECT/INSERT/UPDATE. Ingen DELETE-rettighet nødvendig.
- Torsdag 19–22 sperrer dart_a/dart_b og dermed venue ved overlapp, men ikke HYZR. Før tirsdag 00:01 Europe/Oslo alltid reservert; etterpå frigivelse bare ved bekreftet 10/10 kapasitet. Ukjent, feil eller eldre enn 60 sekunders observasjon sperrer. Server leser eksisterende produkt 1322 direkte med dokumentert GET, ingen medlems-/kundeopplysninger. Kun kapasitetsstatus lagres. Ingen nye schedulere.
- Observasjoner serialiseres med samme dato-advisory lock som hold; eldre API-svar kan ikke overskrive nyere. Kalender og hold bruker samme DB-regel. Hold prøver ny ekstern lesning før overlappende reservasjon og avviser ved API-feil.
- Edge gk-booking-v2 v35 deployet med eksisterende sikkerhetsporter uendret. Alle tidligere 8 filer sammenlignet identiske med live før endring, 1 ny klubbmodul.
- 113 Node-tester passerte. TEST_027_club_priority_ROLLBACK.sql passerte mot faktisk staging: 15 cutoff/snapshot-assertions over vinter/sommer/årsskifte, kalenderblokker, hold-avslag dart A/B/venue, HYZR tillatt og sluttgrense 19:00 tillatt, utdatert observasjon kan ikke erstatte nyere. Hele testen rollback. Service_role fikk ikke ekstra DELETE-rettighet bare for testen.
- Reelt endpoint 2026-11-05: to klubbblokker 19–22, bookingEnabled=false. DB-readback viste produkt1322 variant266116, remaining10, ny checked_at; altså faktisk API-lesning, ikke antatt fallback.
- Reelt endpoint 2026-10-29 etter tirsdagsfrist: ingen klubbblokker når 10/10 gjenstår. Eksisterende HYZR før 1.nov-blokk beholdt. Dette er lesetest, ingen booking før første bookbare dato er åpnet.
- Etter tester: 1 eksisterende reservasjon, 24 claims, 0 notification_outbox. Ingen e-post, kundekode, betaling eller liveordre opprettet.

## Neste konkrete problem før offentlig aktivering
Eksisterende klubbkveld-kasse selger fortsatt uten felles atomisk claim i nye DB. En sen klubbpåmelding kan derfor konkurrere med en vanlig booking etter tirsdagsfrigivelse. Den nye serverregelen fanger opp eksisterende påmeldinger ved lesning, men eliminerer ikke en samtidig betaling i to separate systemer. Før aktivering må klubbpåmelding gå gjennom samme claims/checkout, eller gammel klubbsalgstidsfrist håndheves server-side før generell frigivelse. Ikke sett legacy_rules_verified eller legacy_cron_switch_verified bare fordi regeltesten passerte.

Full betalt prøvebooking med notifikasjoner/Nuki og fysisk test gjenstår. Checkout fortsatt stengt. Ingen privat reservekode i repo.
