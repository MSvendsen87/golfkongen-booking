# Booking 2.0 — API-kartlegging og rettelse av kundeside (25. oktober 2026)

## Offentlig kundeside — kritisk tekstvask

Et tidligere HTML-utkast for `/aktiviteter` hadde internt arbeidsspråk om Pushover, dagens system, illustrasjonsbytte og testkobling. Det **skal ikke vises offentlig**. En rettet, selvstendig kundeside er laget som `GolfKongen_Aktiviteter_KUN_KUNDETEKST_25okt2026.html` (samtalens nedlastbare fil). Filen inneholder KUN markedsførings-/kundeorientert tekst, HYZR med «Åpner snart», DartCounter, innesko/sokker, lenker til eksisterende bookinger og vilkår ved booking. Bilde-URL-ene er brukerleverte Google-miniatyrbilder med eksisterende Quickbutik-bilder som fallback. Unngå interne kode- og driftsdetaljer i enhver fremtidig kundevisning.

**Den rettede HTML-filen er ikke automatisk publisert**. Brukeren må oppdatere Quickbutik `Nettbutikk > Sider > Aktiviteter og booking` i HTML-kildevisning. Ta backup av gammel kode og sjekk mobilvisning. Ingen public admin-debugging eller nøkler må være med i HTML.

## Eksisterende Quickbutik API-tilganger sett i kontrollpanelet

Skjermbilde fra Quickbutik (eieren) viser at det allerede eksisterer **aktive** API-nøkler:
- `Booking tidsync` — PRODUCTS(R), PRODUCTS(W)
- `Booking automasjon` — PRODUCTS(R), PRODUCTS(W)
- `Webhook booking` — PRODUCTS(R), ORDERS(R)
- `Booking kalender` — PRODUCTS(R)
- `Sportskongen-admin` — PRODUCTS(R), PRODUCTS(W), ORDERS(R)
- andre nøkler: Min Bag ordreimport, stock cleanup, Release checker, legacy read-only; **må ikke røres**.

Dette bekrefter at vi **ikke trenger å opprette nye API-nøkler bare for å starte kartleggingen**. Nøkkelverdier er hemmelige; screenshot viste bare navn, scopes og status.

### Eksisterende teknisk oppsett (verifisert fra GitHub)
- `golfkongen-booking/dart-booking.js` bruker `cold-shadow-36dc.post-cd6.workers.dev/products/...` og `gk-booking-admin.post-cd6.workers.dev/booking/closed-times`, samt `/cart/add` til Quickbutik-kassen.
- `venue-booking/venue-booking.js` og `disc-booking/disc-booking.js` bruker tilsvarende produkt- og stengeregler.
- `booking-admin/booking-admin.js` bruker `gk-booking-admin.post-cd6.workers.dev` med vedlikeholds-endepunkt `/booking/maintain-40-days`.
- **Vi har ikke inspisert kilden til de aktive Cloudflare Workers.** Dermed er koblingen mellom API-nøkler og aktive Worker-ruter / ordrewebhooks og Pushover ennå ikke dokumentert. Opprett ikke nye funksjoner som kopierer eksisterende drift uten å kontrollere dette først.

## Rekkefølge for videre integrasjon
1. Fjern all internt rettet tekst fra offentlig `/aktiviteter` med rettet HTML. Bekreft offentlig URL viser bare kundetekst.
2. Read-only inspeksjon av Cloudflare Workers `cold-shadow-36dc` og `gk-booking-admin`: ruter, autentisering, oppdateringer av varianter, webhooks. Ikke del hemmeligheter.
3. Finn original Pushover-utløser (Quickbutik/Make/Cloudflare/annet). Bevar ett varsel per betalt booking.
4. Test i isolert staging: Quickbutik betaling inkl. alle eksisterende gruppepriser og rabattkoder; serverreservasjoner for halvtime; admin kun `post@golfkongen.no` og `kristoffer.mrk@gmail.com`; migrering med betalte/historiske bookingordrer.
5. **Ikke slå av live booking, medlemsgrupper, gammel admin eller Pushover før en kontrollert, betalt, reell testbooking har lykkes** og rollback er verifisert.

Neste mulige manuelle verifikasjon: eieren åpner Cloudflare Dashboard > Workers & Pages > `gk-booking-admin` og deler oversikt over rutene/triggerne (skjul miljøvariabelverdier). Dette er relevant fordi Quickbutik-koblingen her kan lese produkt/ordre, men ikke administrere nettbutikkens HTML-sider eller inspisere Cloudflare Worker-implementasjonen.
