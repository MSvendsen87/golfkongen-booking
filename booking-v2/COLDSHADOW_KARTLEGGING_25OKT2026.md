# Kartlegging av aktiv cold-shadow-36dc Worker – 25.10.2026

**Produksjon ikke endret. Basert på kildekode levert av eier samt eksisterende bookingfrontend i GitHub.**

## Funnet
- **/products/{id}**: Leser Quickbutik v1-produkt med `include_details=true` fra Cloudflare secret `QB_API_KEY` og returnerer i dag **hele** API-svarobjektet for enhver numerisk produkt-ID. Det er unødvendig bred offentlig tilgang, muligens til interne innkjøpspriser og metadata dersom de følger med produktet.
- **/club-members**: Worker kaller Google Apps Script `/exec` og sender returarray ufiltrert til nettleseren **uten autentisering**. Personnavn, e-post, gruppe og aktiv-status finnes i medlemsarkets format. `Access-Control-Allow-Origin: https://golfkongen.no` er bare en nettleserbegrensning, ikke autentisering, og `Cache-Control: public, max-age=300` er uegnet for medlemsdata. En besøkende kan potensielt hente listen direkte.
- Worker har verken `scheduled()`, ordrewebhook, Quickbutik-produktskriving eller Pushover.
- Cloudflare-bildet gjelder **gk-booking-admin**, som har en cron `0 3 * * *`, daglig 03:00 UTC = 04:00 norsk vintertid / 05:00 sommertid. Flytt ikke denne til cold-shadow.
- Apps Script URL i koden viser kildearkintegrasjon, men eksakt dokument-/Sheet-ID er **ikke** bekreftet fra Apps Script-koden. Vi har tidligere funnet et eksisterende Google-regneark på Drive med 24 aktive medlemmer. Bekreft koblingen før noe synkroniseres.
- Popup `MSvendsen87/gk-member-popup.js` og klubbkveld `MSvendsen87/ldk-clubgate/clubgate.js` er **avhengig av /club-members**. Slå aldri av ruten uten å migrere begge frontendene til en autentisert `/members/me`-løsning. Verifiser innlogget konto server-side; klient-oppgitt e-post eller navn kan ikke brukes som autorisasjon.
- Quickbutik rabatt- og kundegruppepris må fortsatt sjekkes autoritativt i kassen. Pushover må finnes i en annen integrasjon og bevares.

## Ny stagingkode – testet, ikke deployet
Samtalevedlegg `GolfKongen_coldshadow_SIKKERHET_STAGING_25okt2026.zip` inneholder:
- `public-product-projection.mjs`: begrenser til 6 kjente bookingrelaterte Quickbutik-produkt-ID-er (1316,1317,1318,1320,1322,1349) og fjerner alle produktfelt som ikke brukes av eksisterende bookingfrontend.
- `public-product-projection.test.mjs`: **34 lokale tester bestått**; disse kontrollerer felter, produkt-ID-verifisering og policy for å stenge offentlig medlemsliste i den *fremtidige erstatningen*.
- `LES_MEG.md`: full driftsplan og avhengigheter.
SHA256 av zip: `2cb595ee7057a7552f5f959119825ced8780c9bdee92736e8312c12bb88d1ab1`.

**Teststatus:** Bare isolerte offline-tests. Det er ikke kontrollert mot faktisk Worker-produksjonsmiljø eller autentisert kunde. Ingen offentlig medlemsliste er stengt i drift ennå; dette er en sikkerhetssvakhet som bør prioriteres i kontrollert migrering.

## Hva som gjenstår før Booking 2.0 kan publiseres
1. Finn den virkelige betalt ordre → Pushover-kjeden, trolig Make eller annen integrasjon. Ikke endre eksisterende varsler før den er dokumentert.
2. Undersøk Quickbutik/Apps Script-koblingen for verifisert kundeidentitet og medlemskap; migrer popup + clubgate samtidig.
3. Test begrenset produktrespons mot alle fire bookingfrontender i staging.
4. Test Quickbutik checkout for 30 min / flere timer og alle 7 medlemsprisordninger.
5. Aktiver kun nye adminfunksjoner når både eierautentisering og autoritativ pris/ordrebekreftelse er kontrollert.

**Neste handling for eier:** Hvis Make ble brukt til Pushover, åpne Make → Scenarios og se etter aktive booking-/Pushover-scenarier. Del bare scenarionavn og modulrekkefølge, aldri tokens eller webhook-hemmeligheter.
