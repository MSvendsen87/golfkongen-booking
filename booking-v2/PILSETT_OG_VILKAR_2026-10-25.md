# Booking 2.0 — viderefør pilsett og bookingvilkår

**Godkjent av eier 25. oktober 2026:** Leie av pilsett og aktiv bekreftelse av vilkår er del av den nye kundevisningen. Kundemobil, PC og den virkelige kassen må fungere konsistent.

## Kontrollert fra nåværende kode og butikk (read-only)
- Quickbutik produkt **1318** «Leie av pilsett», **25 NOK per sett**. Faktisk butikkpris verifisert 25.10.
- `golfkongen-booking/dart-booking.js` har valgfritt pilsett og egen «Legg pilsett i handlekurv», maks 6, 25 kr/sett. Eksisterende kode motvirker gammelt lagret antall og ufrivillig automatisk innlegging.
- `venue-booking/venue-booking.js` har også valgfritt pilsett 0–6 og eget handlekurvtillegg.
- Gjeldende dartkode har vilkårsmodul som viser «Jeg har lest og aksepterer vilkårene», med kildelenke `https://golfkongen.no/sider/terms-and-conditions`. Nåværende aksept huskes i en nettlesernøkkel pr. dag (`gk_booking_rules_ok_daily_v1`).
- Offline mobilforhåndsvisning er nå oppdatert med tilvalg og avkryssingsboks. `booking-v2-preview-mobil-20261025.html` finnes i samtalepakken `GolfKongen_Booking_2_0_MOBIL_20261025.zip`, ikke deployet.
- Behold tidligere utseende og funksjoner, ikke start på nytt.

## Krav for ekte Booking 2.0
1. Vis «Leie pilsett, 25 kr/sett» med antall **0–6** når aktiviteten er Dartbane A, Dartbane B eller Hele lokalet. Ikke for HYZR alene.
2. **0 er standard**. Pilsett skal bare legges i handlekurven dersom kunden aktivt velger et antall. Ved bytte til HYZR skal antall nullstilles.
3. Begge produktene skal betale i **samme Quickbutik-ordre**, knyttet til samme booking. Server må validere ordrelinjer (bookingressurs, start/slutt og pilsett, antall og varepriser). Feil på pilsett må ikke resultere i feilaktig bekreftet full booking; håndter eksplisitt med status/feilmelding.
4. Visa tydelig i oppsummeringen: bookingpris, `antall × 25 kr`, rabatt(er), **total faktisk kassepris**. Kun Quickbutik/autoriserte rabattregler bestemmer sluttpris; previewens timepriser er demo.
5. Ikke anta at kundegrupperabatter aldri omfatter pilsett – kartlegg faktisk vare-/gruppeoppsett. Ansatt/klubb/Team GolfKongen og øvrige ordninger må videreføres.
6. Før ordre eller reservasjon går til faktisk bestillingsflyt må kunden aktivt bekrefte «Jeg har lest og aksepterer vilkårene». Lenke til gjeldende vilkår. Aksept må registreres ved konkret booking sammen med **tid, bruker/ordre og versjon av vilkår**, på autoritativ server. En lokal avkrysning alene er ikke pålitelig bevis.
7. Det gamle daglige samtykket kan fortsatt brukes for å unngå gjentatt informasjonsmodal, men det kan **ikke alene** erstatte påkrevd avkryssing ved ny booking i fremtidig løsning uten egen godkjenning fra eier.
8. Oppsummeringen og Pushover-varsel sendes **én gang per bekreftet booking**, og skal kunne vise antall pilsett og korrekt betalt beløp.
9. Admin skal vise booket aktivitet, pilsett antall, faktisk pris/rabatt og godkjenning av vilkår, uten ekstra manuell oppføring.

## Testkrav
- 0, 1, 2, 6 pilsett med korrekt tillegg; hyzr uten tilvalg.
- Bytte aktivitet etter valg av pilsett må ikke beholde et skjult tillegg.
- Uavkryssede vilkår sperrer bestillingen; lenken fungerer, og godkjente vilkår for riktig booking blir registrert server-side.
- Feil/utsolgt pilsett, avbrutt betaling og rabattkode skal ikke føre til fantombooking eller uønsket push.
- Mobil og PC viser samme vilkår og samme varelinjer.
- Fullfør én kontrollert test i Quickbutik sammen med Pushover før lansering.

## Status
Mobil-prototype: ferdig med tilvalg, prissummering og checkbox; Chromium-interaksjoner kontrollert lokalt 25.10.2026. **Produksjon:** IKKE integrert eller publisert, ingen reelle betalinger. Koble dette til allerede opprettet Booking 2.0 og ikke redesign dagens kunde/admin.
