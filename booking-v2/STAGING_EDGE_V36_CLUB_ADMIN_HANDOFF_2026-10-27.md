# Booking 2.0 – sammenhengende stagingdeploy og handoff 27.10.2026

## Verifisert installert
- Supabase Edge `gk-booking-v2` oppgradert **v35 → v36** fra eksakt GitHub-kilde, alle tidligere støttefiler bevart.
- Fjernet `refreshClub()` og avhengigheten av Quickbutik produkt 1322 fra `/availability` og ordinær `/hold`. Disse sperret ellers dart ved API-feil, selv etter at den nye, delte påmeldingsdatabasen ble installert.
- `/availability` bruker `gk2_day_availability` som nå gir klubbblokk ved aktivt klubbhold.
- Eierbeskyttet `GET /admin/club-access` returnerer liste fra `gk2_admin_list_club_access`.
- Eierbeskyttet `POST /admin/club-access` oppdaterer via `gk2_admin_set_club_access`; format `{customerId:string,active:boolean}`. Begge krever eksisterende Supabase Auth JWT med godkjent eiermail og `gk2_is_admin`.
- Supabase funksjon v36 lest tilbake: admin READ/WRITE kode finnes, `refreshClub` finnes ikke. GitHub commit `2ce6dc2bff96eb17fe50f129c707f9735970e902`.
- Private klubbtabeller og SQL-funksjon for 10 plasser, kollisjon begge veier, samt eierstyrt tilgang og audit ble installert/testet i foregående steg, med rollback. Alle offisielle release gates fortsatt stengt.

## Begrensninger – IKKE utgi som live
- Ingen live HTTP-ende-til-ende prøverespons er bevist i denne økten (runtime uten utgående internettilgang).
- Klubbens `gk2_hold_club_seats` er ikke koblet til et identitetsverifisert kunde-API. **Ikke eksponer rå kunde-ID fra nettleseren**: kunden må autentiseres og ID utledes server-side.
- Klubbbestilling mangler Quickbutik-produkt/variant, 50 kr x seter, hold→checkout-leasing, betalt ordreverifikasjon og idempotent confirm/cancel/recovery. Dersom kunden betaler før dette finnes ingen sikker klubbconfirm.
- Eksisterende bookingcheckout og de åtte release-portene er bevisst fortsatt stengt. Ikke sett gates true som snarvei.
- Club admin API er installert, men visuell UI og medlemskilde-synk ikke gjort; tilgangslisten er tom inntil autorisert admin legger inn faktiske, verifiserte medlems-ID-er.
- Gammel offentlig booking checkout må stenges kontrollert først etter migrasjon/verifikasjon av alle betalte fremtidige bookinger.
- Min Bag-produksjon er urørt.

## Neste sammenhengende implementasjon
1. Verifiser medlemsidentitet fra Quickbutik/Supabase og knytt til autorisert kunde-ID; bygg inn klubbkveld-valg og plassvisning i kalender.
2. Lag klubb-Quickbutik checkout produkt og sikre hold/lease/ordrematching, 50 NOK/plass, webhook confirmation, cancel/recovery og klubb Nuki/Resend/Pushover.
3. Koble GET/POST klubbtilgang til eierens admin-grensesnitt og test eierinnlogging.
4. Kjør automatikk + reelt betalt test fra eier og fysisk kodeprøve. Først deretter fjern eldre bookinginnganger og åpne /aktiviteter.
