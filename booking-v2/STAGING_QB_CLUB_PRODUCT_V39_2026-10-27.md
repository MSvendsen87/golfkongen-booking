# Booking 2.0 – Quickbutik klubbproduct / staging v39 (27.10.2026)

## Faktisk fullført
- Quickbutik skjult produkt 1507, «Klubbkveld – Booking 2.0 (klargjøring)», 50 NOK, 0 lager, ikke offentlig kjøpbart. Gamle produkt 1322 er urørt.
- Seks skjulte datovarianter med 0 lager, 50 kr, fra torsdag 05.11 til 10.12.2026: 306095–306100.
- Staging `gk2_private.club_checkout_variants` registrerer nøyaktig dato, produkt 1507, variant-ID, SKU og 5000 øre, med `enabled=false` på alle 6.
- Staging `club_enrolments` har nå `verified_customer_email`; service-only `gk2_bind_club_verified_email` krever aktivt hold og korrekt verifisert customer UUID, idempotent binding og ingen vilkårlig bytting av e-post.
- Edge `gk-booking-v2` v39 ACTIVE: hvis klubbhold er godkjent, knyttes autentisert Supabase e-post til holdet på serveren. `POST /club/hold` er fortsatt sperret av env+DB release gates.
- Readback: 6 mappingrader, 0 enabled, 0 klubbenrolments og offentlig release fortsatt stengt. Min Bag-produksjon er ikke endret.

## Ikke ferdig / krever mer kode
- Ingen kjøpbare varianter er åpnet; ingen kunde kan kjøpe klubbkveld ennå.
- Trenger et robust checkout-lease-system for klubbprodukter med varer/antall, manuell recovery, og betalingsbekreftelse via verifisert Quickbutik webhook (betalingsbeløp, SKU, quantity og e-post).
- Supabase bekreftelsesfunksjonen er service-role-only men gjør ikke ekstern Quickbutik kontroll selv; må KUN kalles etter autentisk order readback.
- Real world kundelogin og admin i browser, notifier / Nuki, konkurransetester, eksisterende betalte bookinger og kontrollert gammel→ny cutover gjenstår.
- Ikke sett noen gate true før etter reell E2E test. Denne statusen representerer produkttilrettelegging, ikke live kjøp.
