# GolfKongen Booking 2.0 — forberedelser

**Arbeidsgren:** `booking-v2-preview-2026-10-24`
**Status:** Utkast, IKKE publisert. Ingen endringer i dagens bookingkode, Quickbutik-produkter, Workers eller Supabase-tabeller.

## Kartlagt
- Dagens kundevisninger: `golfkongen-booking/dart-booking.js`, `disc-booking/disc-booking.js`, `venue-booking/venue-booking.js`.
- Adminvisning: `booking-admin/booking-admin.js`, Supabase `gk_booking_rules` og `gk_booking_admins`.
- Betaling skjer via Quickbutik-varianter i handlekurv; mange varianter er én time, mens lokalet har kombinerte tidsrom.
- Dagens konfliktsjekk skjer i stor grad på klienten og tolker variantlager 0 både som opptatt og stengt. Dette skal ikke videreføres som autoritativ bookingkontroll.

## Besluttet
- Én HYZR-simulator, pris per simulator/tidsrom, ikke per spiller.
- Felles tilgjengelighet for HYZR, dartbane A, dartbane B og hele lokalet.
- Hele lokalet opptar alle tre fysiske ressurser, mens hver dartbane ellers er uavhengig.
- Sesongliga bruker normal booking; tre beste runder av ubegrensede forsøk. Turneringsmodulen prioriteres senere.
- Eksisterende bookinghistorikk og sperringer skal bevares. HYZR + hele lokalet er stengt t.o.m. 31.10.2026, dart fortsatt åpen.

## Kundeside
1. Samlet bookingflyt på `/aktiviteter` med HYZR / dart / hele lokalet.
2. Velg dato og aktivitet, velg varighet fra 30 minutter til flere timer, se tilgjengelige starttider og årsak til sperret tid.
3. Fast oppsummering av start, slutt, ressurs og serverberegnet totalpris før betaling.
4. Bevar eksisterende bookinglenker som innganger.

## Admin
- Ressurskalender per halvtime, dag og uke, med tydelig forskjell mellom booket / holdt / stengt / avbestilt.
- Regler for åpningstid, sperringer og klubbkveld (torsdag 19–22, frigivelse tirsdag 00:01).
- Prisregler per ressurs, varighet, dag og tidsperiode; forhåndsvisning før aktivering.
- Bookingstatus, ordre-ID og betalingshistorikk.
- Eierstyrt tilgang, auditlogg, ingen brede privilegier til andre apper.

## Planlagt teknisk fundament
- Serverbasert ressurstildeling i trinn på 30 minutter. Halvåpne tidsintervaller `[start,end)` forhindrer falsk konflikt ved tilstøtende bookinger.
- Atomisk hold med utløp og verifisert Quickbutik-betaling før bekreftelse. Ingen dobbeltbooking.
- Én regelmotor for kundevisning og admin; alle priser og konflikter dobbeltsjekkes server-side.
- Betalt ordre skal identifiseres fra dokumentert Quickbutik-ordre, ikke bare variantlager 0.
- Isolert migrering/test; særlig sikkerhet rundt delt Supabase-database og eksisterende bookingdata.

## Utviklingsport
Ingen migrering, checkout-integrasjon eller publisering før riktig Quickbutik-order/webhook-opplegg er verifisert og regler/priser eksplisitt godkjent. Deretter testmiljø, parallelle akseptansetester og planlagt produksjonsbytte med rollback.

En offline, interaktiv HTML-demo for både kunde og admin samt ren logikk med 26 beståtte automatiserte tester ble laget som egne samtalefiler 24.10.2026. Denne grenen er kun for sporbar planlegging før koden eventuelt overføres og gjennomgås.