# GolfKongen HYZR Control – testversjon, IKKE publisert

Dette er en separat modul for Booking 2.0. Den gamle Cloudflare Worker gk-booking-admin (produkt 1316–1349) skal ikke endres.

## Ferdig i modulen
- Beregner aktiv HYZR-/hele-lokalet-økt ut fra serververifisert betalt booking.
- Varsel ved nøyaktig fire minutter igjen.
- QR-betalingslenke vises bare når serveren har gitt et gyldig, kortvarig tilbud for riktig booking, og det ikke overlapper neste bestilling.
- Automatisk avslutningsstatus ti minutter etter slutt som standard – aldri inn i neste bekreftede eller midlertidig holdte booking.
- Ubetalt, kansellert, ugyldig og overlappende tid sperres.
- Ingen endring i PC, Quickbutik, Nuki eller database. Kjør tester med:
  node --test booking-v2/hyzr-control/session-state.test.mjs

## Mangler før faktisk styring på HYZR-PC
1. Aktivt Supabase-prosjekt eadgdcimcmfyuicizboo må kobles til og den reelle gk2_private-modellen verifiseres. fwztrnxhfvrlceicctlv er et annet prosjekt.
2. Sikret GET /hyzr/device-status for den ene HYZR-PC-en: unik autentisering, ingen personopplysninger og bare serververifisert betalte bookinger. Status beregnes med session-state.mjs.
3. Utsted engangs-QR fra golfkongen.no med en kortvarig bookingbundet token. Legg til atomisk hold for +30/+60/... minutter i samme Booking 2.0-kalender (også hele-lokalet-kollisjoner). Bekreft forlengelse først fra betalt Quickbutik-webhook, aldri fra retur til takk-siden.
4. Test med HYZR i reell skjermmodus. Tkinter-overlegg er en myk sperre, ikke en Windows-sikkerhetssperre. Ingen Windows-avslutning eller tvangsavslutning av HYZR. Etabler personale-overstyring og feilsignal.
5. Test avlyst/refundert booking, oppkoblingsbrudd, 22:00, sommertid/vintertid og bookinger uten pause.

## Tre andre godkjente forbedringer
- Mobilbooking: færre trykk, tydelig halvtimekalender og enkel betaling.
- SMS og avbestilling: samtykke, idempotente påminnelser og trygg selvbetjent kansellering med Nuki-revokering.
- Statistikk i Sportskongen Admin: kapasitet, faktiske betalte beløp, forlengelser og ledige timer.

**Denne grenen er bare en isolert test. Den skal ikke bygges inn i live Booking 2.0 før punktene over er gjennomgått.**

## Godkjente regler 08.11.2026
- Kunde kan fortsette/forlenge i **inntil 10 minutter etter bokført slutt**. Neste reservasjons start overstyrer alltid denne marginen.
- QR skal være tilgjengelig også i marginen når det faktisk er plass, men bare et verifisert betalingstilbud åpner betaling.
- Forlengelsespris: opprinnelig **faktisk betalte øre / opprinnelig varighet × nye minutter** (avrundes til hele øre); ikke bruk ordinær pris slik at rabatten forsvinner. Klippekort skal trekke klipp, ikke gi gratis tid. 0-kroners ordre uten klippekort må kontrolleres.
- Vipps ePayment foretrekkes; dokumentasjon: https://developer.vippsmobilepay.com/docs/APIs/epayment-api/quick-start/. Krever egne sales-unit-nøkler, webhook og sikker capture/ordreavstemming; Quickbutik fallback for kundekasse.


## Personlig ansattkode – implementert i Testing, ikke på simulator-PC-en
- Egen kode per ansatt, ingen felles masterkode. Administrator utsteder koden til en ansatt-e-postadresse, og kan tilbakekalle den. Kodene er 8 siffer, bcrypt-hashet i privat schema og låses 15 minutter etter fem feilforsøk.
- Ansatt må ha egen bekreftet HYZR-reservasjon registrert på samme e-post, med verifisert betaling/klippekort. Kode kan aktiveres under bookingen eller inntil ti minutter etterpå.
- Når koden er bekreftet blir status `staff`; fireminuttersvarsel og QR-forlengelse skjules. Opplegget gir ekstra spilletid uten å endre selve bookingen, frem til den første av: ny HYZR-/hele-lokalet-booking/hold, administrativ HYZR-sperring eller stengetid.
- Ved ny booking må det fysiske PC-programmet avslutte den gamle spilløkten og starte en ny. Overgang må observere booking-ID, ikke bare `active`-status.
- Enheten som kan sende PIN må først autentiseres. **Ingen offentlig PIN-validerings-API eller faktisk PC-program er publisert.** Test-Admin har et UI-utkast for utstedelse/sperring av koder, ikke publisert i gjeldende admin.

## 10 minutters ekstra tid
- Standard kunde kan betale/forlenge i inntil ti minutter etter endt booket tid. En ny reservasjon/hold overstyrer alltid og sperrer tilgang ved sin start. Server må ha jevnlig kontakt med PC-programmet; ved nettutfall må PC-programmet sperre, ikke fortsette ubegrenset.
- Staff mode er separat og stopper ved stengetid, men erstatter ikke vanlig booking eller betaling for nye kunder.

## Samme pris og Vipps
- Serverens `gk2_hyzr_extension_quote` bruker originale `paid_ore / (end_min-start_min)` og multipliserer med antall nye minutter. Medlemsrabatt beholdes fra opprinnelig betaling. Klippekort får 0 kr men skal trekke nye klipp (ikke gratis).
- Denne funksjonen er kun et **ikke-reservert prisforslag**, uten QR/ordre/betaling. Ekte forlengelse må legge inn atomisk, tidsbegrenset hold og etter vellykket betaling utvide bookingen/claims. Fryse basis-timepris ved første forlengelse slik at pris ikke driver ved flere påfølgende.
- `vipps-extension.mjs` bygger bare forespørselsdata for direkte Vipps ePayment. For HYZR-skjermen er `userFlow:QR` riktig, mens på mobil kan `WEB_REDIRECT` åpne Vipps uten nettbutikkkassen. Ingen API-kall sendes ennå.
- Vipps ePayment krever salgsstedets MSN, API subscription key, client id, client secret, tilgangstoken, idempotent ordre-referanse, signert webhook og polling som reserve. Bekreft både autorisering og capture før booking utvides. Bruk Quickbutik som reserve.
- Vipps har minimum **1,00 kr** i Norge; 0-kroners klippekort eller pris under 1 kr må håndteres uten ordinær Vipps-transaksjon.
- Krever betalingsoppsett før aktivering. Ikke legg Vipps-nøkler i GitHub eller i ChatGPT.

## Tests og utrulling
- GitHub CI kjører kontroll av Booking Admin-skript, HYZR-sesjonslogikk og Vipps-betalingkontrakt.
- I Testing er serverfunksjonene og private tabeller opprettet, med tilbakerullede prøvetransaksjoner for kodeutstedelse, utløst/låst kode, pris og reservasjonsoverlapp. Ingen aktive ansattkoder er opprettet.
- Behold draft PR. Ikke slå på PC-styring eller betalingsflyt før fysisk test og sikker enhetsautentisering.
