# Booking 2.0 – fortsettelsespunkt for neste arbeidsøkt (25.10.2026 eller senere)

## Status
- Produksjon urørt. IKKE deploy, migrer eller endre Quickbutik nå.
- Visuell HTML-demo for kunde og admin er laget og fungerer offline. Brukeren liker utformingen, så BEHOLD designet.
- Opprinnelig utviklingsgren: `booking-v2-preview-2026-10-24`. `booking-logic.mjs` og tester finnes i denne grenen.
- Oppdatert samtalepakke: `GolfKongen_Booking_2_0_forhandsvisning.zip`, med HTML-demo, 26 kjernelogikktester, 34 tester av simulerte reservasjoner/checkout, skisse til databaseskjema (`ROLLBACK`, ikke kjør) og arbeidsnotater.
- HTML-demoen er ytterligere sikret med escaping for administrativt skrevet tekst uten visuell redesign.

## Vedtatt
- Bare én HYZR-simulator, pris per simulator/tidsrom, aldri per deltaker.
- Dart A og Dart B kan bookes hver for seg.
- Leie av hele lokalet tar HYZR + begge dartbanene.
- Vanlig booking må ha 30-minutters mulighet, 60 minutter eller flere timer.
- Vinterliga/turneringer lavere prioritet; tre beste av ubegrensede forsøk ved senere oppsett.

## Dagens regler som må bevares
- Aktive Supabase-sperringer for HYZR (produkt 1320) og hele lokalet (1349) frem til og med 31.10.2026; dart A/B forblir tilgjengelige.
- Eksisterende betalte bookinger skal bevares.
- Kjente regler: jul 24.–25.12; hele-lokalet-stenging lørdag 10–16; klubbkveld torsdag 19–22 med frigivelse tirsdag 00:01 hvis ingen er påmeldt.
- Ikke bruk Quickbutik variantlager=0 som bevis på betalt booking. Lager=0 kan også komme av stenging.

## Viktige tekniske forberedelser
- Del opp statuses: held / payment_pending / confirmed / expired / cancelled / paid_unallocated / refunded.
- Server skal atomisk låse hver 30-minuttersressurs i databasen; browser-kontroll er bare presentasjon.
- Betalingsbekreftelse må validere ordrenummer, riktig beløp, status og signert/autorisert kilde. Ubetalt handlekurv bekrefter ikke booking.
- Dersom betaling er forsinket etter at hold er utløpt, må den gå til manuell avklaring/refusjon, ikke opprette en dobbelbooking.
- Idempotente betalinger og hendelser. Statushendelser og adminendringer loggføres.
- Quickbutik dokumentasjon bekrefter at ordrenummer tildeles ved besøk i checkout og at ubetalte ordre kan ligge igjen: https://quickbutik.com/no/hjelp/hvorfor-er-ikke-ordrenummerne-mine-i-rekkefolge
- Quickbutiks faktiske støtte for dynamisk bookingpris og verifisert webhook/API er ennå IKKE verifisert. Ikke bygg produksjonscheckout på antakelser.

## Neste arbeidsrekkefølge når brukeren er klar
1. Bekreft at demoens kundevisning og admindesign fortsatt er ønsket.
2. Bestem priser: HYZR 30/60/90/120+, dart 30/60+, lokalet 4 timer og påslag.
3. Bekreft bookinghorisont, cutoff, avbestilling og maks lengde (forslag: samme 40 dager / 20-min cutoff som eksisterende).
4. Kartlegg produksjonsbetalingen i Quickbutik og test med kontrollert testordre uten å forstyrre kunder.
5. Implementer isolert server-API + transaksjonell slot-reservasjon, RLS og adminroller. Test parallellbestillinger og migrering med read-only data først.
6. Test på staging/forhåndsvisning, få eksplisitt godkjenning og planlegg kontrollert overgang/rollback.

Ingen faktisk produksjonsmigrering er autorisert per nå.
