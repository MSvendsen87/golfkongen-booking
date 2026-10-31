# Pushover skal videreføres i Booking 2.0

**Beslutning 24.10.2026:** Eier ønsker å beholde mobilvarsling via Pushover ved booking. Den fungerer i eksisterende oppsett. Dette er et **lanseringskrav**, ikke en valgfri fremtidig funksjon.

## Kartlegging og usikkerhet
- Tidligere fungerende oppsett (januar 2026): Separate **Make-scenarier med SuperSaaS-webhook** for disc/simulator, dart og klubbkveld. Hvert scenario sendte direkte til Pushover; Disc, Dart og Klubbkveld ble testet. Eksempeldata fra SuperSaaS: `res_name`, `full_name`, `start`, `finish`, `price_decimal`, `email`, `mobile`, `id`.
- Nåværende GitHub-filer `dart-booking.js`, `disc-booking.js`, `venue-booking.js` og `booking-admin.js` har ingen Pushover-kall. Dermed kan ikke det *nåværende* varslingsutløserstedet fastslås fra denne koden. Det kan ligge i Make, Quickbutik, SuperSaaS eller annen privat integrasjon.
- Supabase-prosjektets registrerte Edge Functions har ikke en tydelig Pushover/booking-varsler. Ikke anta at nøklene ligger i Supabase.
- Ingen Pushover-token, brukernøkkel, Make-webhookadresse eller testmelding skal lagres her eller i frontend/GitHub.
- Ikke slå av eller rekonfigurer det eksisterende Pushover-oppsettet før nytt er kontrollert med eieren.

## Minstekrav ved lansering
1. **Et Pushover-varsel per reell, bekreftet booking**, både HYZR, dart A/B og hele lokalet. Klubbkveld skal beholde eksisterende varsling også dersom funksjonen videreføres.
2. Behold avsender/oppsett og minst eksisterende felt: aktivitet/bane, dato, fra–til, kundenavn, pris, booking-/ordre-ID. Kontaktdata der nåværende melding inkluderer det.
3. Ingen vanlig «ny booking»-push ved åpning av kalender, valg av tid, handlekurv, ubetalt ordre, ubetalt hold, stengeregel, utgått reservasjon eller avbrutt betaling.
4. **Felles bestilling av flere sammenhengende halvtimeintervaller gir ett varsel for hele perioden**, ikke et varsel for hver 30-minuttersblokk. 90 min = én booking.
5. Push utløses bare fra betrodd serverside-hendelse etter validert ordre/betalingsstatus og faktisk reservert ressurs. Et browser-kall eller en vilkårlig ordrestatustekst er ikke nok.
6. Hendelsesnøkkel for deduplisering: `booking_id:event_type:version`, eksempel `booking_123:confirmed:v1`. Egen varslingsstatus/outbox med retries/backoff og logg (success/failure). Beskytt mot duplikater når samme webhook mottas flere ganger.
7. Når betalt ordre ankommer etter utløpt hold og tiden nå er opptatt: sett **paid_unallocated** for manuell behandling, aldri normal bekreftelsespush; send egen adminfeilmelding bare hvis eksplisitt besluttet.
8. Systemet skal tåle at Pushover/Make er nede: bookingen kan fortsatt bekreftes, varsling kan forsøkes på nytt og avvik vises på admin-siden.
9. En lenke i varselet bør gå til den aktuelle bookingen på godkjent/adminbeskyttet side (ingen hemmelige tokens i lenken).
10. Ingen nye avgifter eller bytte av tjeneste uten forhåndsgodkjenning.

## Administrasjonsgrensesnitt
- På hver bekreftet booking: Pushover-status: `Ikke sendt`, `Sendt`, `Feilet – prøver igjen`. Vis sist sendt-tid og varslings-ID.
- Mulighet for **eier** til å prøve på nytt dersom et varsel feiler, med eksplisitt bekreftelse og logg. Vanlig oppdatering av skjermen må ikke sende på nytt.
- Valgfritt separat varsel for kansellering/ombooking senere, etter godkjenning. Endringer i push-regler må ikke forandre selve bookingens status.

## Neste kontroll når eieren har PC/Quickbutik
- Spor én historisk booking fra nettbutikk via ordre og eventuell Make-logg til Pushover. Dokumenter utløseren uten å dele hemmeligheter.
- Sjekk både simulator, dart A/B, hele lokalet og klubbkveld. Hele lokalet-varsel er ikke bekreftet i historisk Make-oppsett.
- Test én kontrollert betalt booking og nøyaktig **ett** Pushover-varsel, deretter duplisert webhook og én avbrutt betaling uten push.
- Først når den nye flyten er dokumentert og testet, besluttes om eksisterende Make-scenarier gjenbrukes eller om et server-side adapter kobles til samme Pushover-konto. **Ingen endring i produksjon nå.**

## Prioritet
**Blokker produksjonslansering dersom Pushover-varsel ved ny bekreftet booking ikke er dokumentert og verifisert.**

## 25.10.2026 – Make-scenario og Worker-spor

Eierens skjermbilde fra eu2.make.com viser 1 av 2 scenarier aktive. Aktivt scenario med navn 'Integration Webhooks, HTTP' har kjeden 'Custom webhook -> HTTP GET' til Cloudflare Worker nameless-feather-dbf3.post-cd6.workers.dev. Historikken viser vellykkede kjøringer blant annet 24., 23. og 19. oktober.

Dette BEVISER IKKE at scenariet faktisk sender Pushover eller at en Quickbutik-ordre er betalt. Pushover-utløser og ordrestatus må fremdeles bekreftes.

Sikker videre kontroll:
1. Cloudflare: søk etter Worker nameless-feather-dbf3 og vis dens Edit code-kilde read-only. Ingen Deploy, testanrop, URL-GET eller endringer.
2. Se på routes, ordrestatus, Pushover/andre meldings-API og eventuell Quickbutik-integrasjon, uten å dele hemmelige nøkler, webhook-tokens eller kundedata.
3. Alternativt åpne HTTP-modulen i Make og inspiser metode og URL-host/path (masker hemmelige query-parametere og headers).
4. Undersøk også hvilket scenario som er inaktivt, og om det er tidligere bookingvarsling.
5. Bruk en eksisterende ordre og gammel Make-historikk read-only for å spore utløseren før ny test.

Ingen endringer i dagens Make/Workers/Pushover må gjennomføres før dette er dokumentert.

## 25.10.2026 – aktiv ordre-til-Pushover Worker nå bekreftet

**Bekreftet fra live Worker-kilden som eieren limte inn (ikke publisert av oss):** `nameless-feather-dbf3` tar `event_type` og `order_id` fra URL, godtar `order.new` (også manglende event_type), henter `v1/orders?order_id=...&include_details=true` med Cloudflare `QB_API_KEY` og sender direkte til Pushover `/1/messages.json`. Produktene 1316/1317/1320/1322/1349 lager varsel; 1318 inngår bare som pilsettinfo.

**KRITISK:** Koden hadde **virkelige Pushover-token og brukernøkkel hardkodet**, nå delt i chat. De skal IKKE kopieres inn i repo/dokumenter/tester. Roter Pushover-applikasjonstoken så snart det kan koordineres med en fungerende varsling. Vurder også fornying av brukernøkkel; lagre begge kun som Cloudflare Secrets.

Svakheter i dagens Worker: ingen autentisering av webhook-forespørselen, ingen streng betalingssjekk, ingen varig deduplisering, mulig varsling fra ubekreftede ordrer, ingen idempotent retry-prosess. Ordrelinjer kan resultere i flere Pushover-meldinger (som kan være riktig ved flere separate bookinglinjer); én booking med halvtimeblokker skal ikke generere en melding per blokk.

**Kontroll i tilkoblet Quickbutik-verktøy:** eksistende, betalte ordre viste normalisert `paymentStatus: paid`, og `fulfillmentStatus: completed`. Den eksakte navngivningen i *rå Quickbutik v1 REST JSON* må fortsatt inspiseres (kan hete `payment_status`); bruk streng allowlist, ikke anta at `completed` alene betyr betalt.

**Staging-artifakt, ikke deployet:** `GolfKongen_Pushover_V2_STAGING.zip` (samtalevedlegg) med `booking-push-worker.mjs`, `booking-push-worker.test.mjs`, `schema.sql`, `README.md`. 48/48 lokale tester bestått. Ny Worker krever autentisert POST-header, gyldig `paymentStatus=paid`/`payment_status=paid`, egen Cloudflare D1-tabell med unik dedupliseringsnøkkel per ordrelinje, Cloudflare Secrets og eksplisitt `PUSH_ENABLED=true`. Uklart leveringsutfall krever manuell vurdering, ikke blindt automatisk nytt varsel. Koden er utviklingsutkast og ikke integrasjonstestet mot faktisk rå Quickbutik eller D1.

**Nødvendig før publisering:** 1) verifiser rå v1-felt fra en anonymisert faktisk betalt ordre, 2) finn betalt-event eller sikker betalingsavstemming for ordre som var ubetalt ved `order.new`, 3) test en kontrollert faktisk booking i separat staging, 4) roter nøkler og endre Make-endepunkt kontrollert med rollback; 5) bevar eksisterende varsling under overgangen.

**Produksjon uendret**: ingen webhook, Cloudflare Worker, Pushover-token, Quickbutik, medlemstabeller eller bookingregler endret.
