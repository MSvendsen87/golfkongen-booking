# Automatisk Nuki-dørkode ved GolfKongen-booking (klargjort, IKKE AKTIVERT)

Denne modulen er isolert fra alle aktive booking-JavaScript-filer og GolfKongens Supabase.
**Ingen kode blir sendt til kunder før Cloudflare Worker, D1, Nuki Web og Quickbutik er koblet sammen, testet og `ACTIVE=true`.**

## Omfang

- Betalte Quickbutik-ordrer med dato/tid fra produktvarianter: 1316 Dart A, 1317 Dart B, 1320 simulator, 1349 Hele lokalet
- Ingen tilgang for 1318 pilsett, generelle butikkvarer eller 1322 klubbkveld
- Én separat, unik seksifret Nuki Keypad-kode per bookinglinje, aktiv 5 min før start til bookingens slutt
- Avbestilling og utløp trekker tilbake Nuki-koden; utløpte koder slettes
- Kun server-side API, ingen hemmeligheter i offentlig JavaScript, e-post sendes **separat** fra Quickbutiks vanlige ordrebekreftelse
- Ingen sending før Nuki Web API returnerer matchende kode og adgangstider
- Bruk en fysisk pilot-test: Nuki Web kan vise en kode før den er synkronisert til selve Smart Lock

## Hva må klargjøres

1. Sørg for at Nuki Smart Lock er koblet til **Nuki Web** med internett, og at Keypad 2 fungerer med manuelt registrert kode.
2. Logg inn på https://web.nuki.io, finn `API` og aktiver REST API dersom støttet på kontoen. Opprett token med kun nødvendig tilgang til låser/autoriseringer; kopier aldri API-token i ChatGPT eller GitHub. Nuki Lock-ID hentes fra Web API eller kontoen.
3. I Cloudflare-konto som allerede drifter GolfKongens eksisterende Workers: opprett **ny isolert Worker** og **ny D1-database** kun for dørtilgang. Ikke erstatt noen av de eksisterende Workers.
4. Initialiser D1 med `schema.sql` og bind den til Worker som `DB`.
5. Worker entrypoint: `worker.mjs`. Deployment må inkludere dens import `booking-access.mjs`.
6. Sett følgende som **Cloudflare Secrets**, aldri i GitHub eller browser:
   - `NUKI_API_TOKEN` – API-token fra Nuki Web
   - `NUKI_LOCK_ID` – riktig Smart Lock-ID
   - `QUICKBUTIK_API_KEY` – Quickbutik API-nøkkel med lesetilgang til ordrer
   - `QUICKBUTIK_HOOK_SECRET` – tilfeldig høyentropi hemmelig streng i webhook-URL (minst 32 byte)
   - `RESEND_API_KEY` – Resend send-only API key
   - `CODE_KEY_BASE64` – Base64-kodet 32 tilfeldige byte for AES-GCM-kryptering; **må backupes sikkert**, og aldri roteres uten re-kryptering
   - `MAIL_FROM` – f.eks. `GolfKongen <booking@golfkongen.no>` fra verifisert Resend-domene
7. Worker miljøvariabel `ACTIVE=false` for pilot-klargjøring. Worker GET `/health` rapporterer status uten å eksponere hemmeligheter.
8. Legg inn Quickbutik-webhooks for betalt ny ordre (`order.new`) og kansellert ordre (`order.cancelled`) med mottaker `https://<ny-worker>/hooks/quickbutik/<QUICKBUTIK_HOOK_SECRET>`. Quickbutik webhook er GET med `event_type` og `order_id`; Worker slår uansett opp ordren med Quickbutik API før tilgang.
9. Sett Cloudflare Worker Cron Trigger `*/5 * * * *`, som reviderer ordrestatuser og Nuki-autoriseringer. `ACTIVE` må fortsatt være `false` til pilot.
10. Lag en **ny fremtidig betalt testbooking** av en darttid (eventuelt egen test), sett `ACTIVE=true` kun for kontrollert pilot. Verifiser Nuki Web-koden, test den fysisk **på åpen dør**, sjekk tidsgrensene, e-posten og kansellering. **Ikke bruk gamle betalte ordrer som allerede er gjennomført.**
11. Logg siste feil fra D1 `booking_access.last_error`; etter piloten kan automatikk aktiveres permanent. Koder som Nuki kun viser i skyen (ikke synkronisert fysisk) må aldri regnes som garantert fungerende; ha manuell nødprosedyre.

## Viktig om bekreftelse

Quickbutiks ordinære ordrebekreftelse er en butikkstyrt e-post som sendes umiddelbart etter kjøpet, før Nuki nødvendigvis har laget en synkronisert kode. Derfor beholdes denne uendret; egen e-post med emnet «Adgangskode til GolfKongen – <dato>» sendes automatisk straks koden er verifisert via API. Legg eventuelt generell setning i eksisterende Quickbutik-ordrebekreftelse om at adgangskode kommer i separat e-post. Ingen lovnad om at en dynamisk adgangskode kan injiseres i Quickbutiks standardmal uten støttet API-funksjon.

## Verifisering og begrensninger

- Lokale, rene tester: `node --test nuki-access/booking-access.test.mjs`
- **Ikke verifisert ende-til-ende:** Nuki-token/lås, fysisk keypad, Quickbutik legacy API med den tilknyttede butikken, Cloudflare D1, Resend-produksjonsutsendelse eller ekte bookinger. Disse testene krever fysisk pilot og hemmeligheter satt direkte i leverandørenes administrasjonsgrensesnitt.
- Før produksjon bør man ha adminvisning med status, manuell omsending av e-post og varsel når koden ikke blir opprettet i tide.
- Aktivering av kode til ansatte eller faste privatkoder gjøres i Nuki-appen, ikke via denne automatikken.
- For 40-dagers bookinghorisont og maks Nuki-kodekapasitet må utløpte autorisasjoner ryddes fortløpende.
- Tidszone: `Europe/Oslo`, vakt mot ugyldige/ambivalente DST-tidspunkt, og UTC ISO til Nuki.

Referanser:
- https://quickbutik.dev/api-v1/orders/get-orders
- https://developer.nuki.io/t/web-api-example-manage-pin-codes-for-your-nuki-keypad/54
- https://developer.nuki.io/t/integration-of-web-api-for-short-time-rentals/8273
