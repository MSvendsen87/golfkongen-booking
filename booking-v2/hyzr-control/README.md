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
