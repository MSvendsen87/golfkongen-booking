# Verifisert status 27. oktober 2026 – integrasjon og medlemspriser

## Faktisk installert i Quickbutik
- Kategori 144 /aktiviteter har nå gk2-booking-anchor, lagt til uten å erstatte eksisterende innhold. Kategoriredigeringen fjerner script-elementer.
- Aktivt tema Golfkongen 3.1, hovedfil template (editor 248346), har én GK2_ACTIVITY_EMBED_20261027 loader før </body>. Den kjører bare på /aktiviteter og laster eksisterende GitHub Pages booking/embed.js?v=20261027-2.
- Midlertidig forsøk i theme.js ble reversert. Ingen nødvendig endring i theme.js.
- Reell nettleserverifisering på https://golfkongen.no/aktiviteter?booking2=preview: kalender lastet fra staging, hele lokalet har varighet 4–12 timer; 5 timer + 2 pilsett viser 1050 NOK. Fortsett til booking er deaktivert.
- Vanlig /aktiviteter beholder gamle bookinglenker og viser ikke den nye kalenderen mens portene er stengt. Klubbkveld er fortsatt egen lenke.
- API-installasjonsforsøk run 40498206924 fikk 403 på GET /scripts før noen skriving; API-nøkkelen ble ikke utvidet. UI-installasjonen ovenfor er den faktiske løsningen.

## Ny kritisk oppdagelse: medlemsprisens omfang
Alle 121 eksisterende beløp ble lest i den faktiske Quickbutik-administrasjonen og sammenlignet med godkjent prismodell: 0 beløpsavvik. Men 29 rader er knyttet til enkeltvarianter, ikke hele produktet. Disse er IKKE rettet, og gamle testordrer beviser ikke riktig pris på nye tidspunkter.

| Gruppe | ID | Priser totalt | Kun enkeltvariant |
|---|---:|---:|---:|
| Betalt disc medlemskap + dartklubb | 3277 | 24 | 6 |
| Team Golfkongen | 3275 | 8 | 2 |
| Frisbee + Dart | 3273 | 24 | 6 |
| Ansatte | 3272 | 33 | 7 |
| Ambassadører | 3271 | 8 | 2 |
| Frisbeeklubber | 3270 | 8 | 2 |
| Dartklubber | 3269 | 16 | 4 |

Berørte produkt/variant-par: 1474/282439, 1475/282440, 1476/282441, 1477/282442, 1486/282443, 1490/282444, og Ansatte 1498/282445. Variant 282442 er gammel GK2-TEST-ONLY. Andre 92 rader vises på produktnivå, men arving til nye varianter må fortsatt bevises i innlogget handlekurv.

Administrasjonen Legg til priser viser enkeltvarianter når produktet har varianter. Ingen støttet produktnivå-masseoperasjon for disse 29 er hittil funnet. Quickbutik-pluginen og dokumentert V1-produkt-API tilbyr ikke kundegruppepris-skriving. Ikke bruk udokumenterte endepunkter, ikke slett varianter, og ikke erstatt eksisterende grupper/rabatter med generelle prosentrabatter. Ingen henvendelse er sendt til support.

## Fortsatt ikke ferdig
- Hold alle publiseringsporter stengt: medlemsprisomfang, torsdag klubbprioritet og dynamisk frigivelse tirsdag 00:01, full betalt kjede og samtidig checkout, frakt/mva, varslingskjede og fysisk lås er ikke samlet godkjent.
- Gjensidig ressursblokkering er DB-testet for alle 33 varigheter med rollback. Alle 23493 ordinære variantpriser er verifisert. Isolert ekte anonym variant-handlekurv passerte og ble låst tilbake. Disse resultatene betyr ikke full aktivering.
- Arbeidet med vanlige butikkfraktregler pågår i separat samtale; ikke overskriv det.
- Privat reservekode skal aldri legges i kode, status, kundetekst eller e-post.
