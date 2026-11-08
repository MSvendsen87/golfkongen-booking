# HYZR-PC status – kun Testing og lesing

Dette er en separat, **deaktivert** status-endpoint i Supabase Testing
`eadgdcimcmfyuicizboo`, versjon 1. Ingen endringer i live `gk-booking-v2`.
Distribuert med `verify_jwt=false` ettersom fysisk HYZR-PC bruker sin egen
krypterte enhetsnøkkel, ikke sluttkundens JWT. Funksjonen autentiserer selv og
svarer **503** inntil en separat 256-biters enhetsnøkkel er klargjort.

## Innhold
- Leser kun `gk2_hyzr_preview_state` som allerede verifiserer betalt HYZR-/
  hele-lokalet-booking, start, slutt, neste bookinger, ansattmodus og sperretid.
- Returnerer bare booking-ID, ressurs, tidsgrenser, server-tid og fase.
  Aldri kundens navn, e-post, pris eller intern service-nøkkel.
- Ingen åpning eller lukking av HYZR og ingen oppdatering av bookinger.
- QR og betaling er av og `deviceControlEnabled:false` inntil sikker
  utrulling er ferdig.
- Ingen CORS for browser-sider. Kun GET. Ingen logging av hemmeligheter.
- Blir ikke tilgjengelig ved manglende eller feil `GK2_HYZR_DEVICE_TOKEN_SHA256`.

## Før aktivering (ikke gjort)
1. Generer en unik tilfeldig token på trygg måte lokalt på simulator-PC-en,
   minst 32 byte, kodet som base64url. Ikke send token i samtalen eller GitHub.
2. Beregn SHA-256 av token og lagre **hashen** i Supabase Testing som
   Edge Function-hemmeligheten `GK2_HYZR_DEVICE_TOKEN_SHA256`.
3. Lagre råtoken lokalt på HYZR-PC-en som en Windows-hemmelighet med tilgang bare
   for kontrollprogrammet. Ikke i Quickbutik, offentlig JS eller logg.
4. Kall GET med `X-GK2-HYZR-Device-Token: <token>` over TLS. Oppdater omtrent
   hvert andre sekund. Ved mistet forbindelse må sperre senest etter seks
   sekunder, med forrang for serverens `lock_at`.
5. Betalt ny booking med ny ID må nullstille HYZR-spillet før neste kunde slipper
   inn. **HYZR-nullstilling er ikke implementert eller bekreftet.**
6. Implementer sikker, bookingbundet Vipps/klippekort-forlengelse og verifiserte
   betalinger. Ingen forhåndsvisning/QR i denne funksjonen kan utløse betalingen.
7. Test i fysisk Windows 10-PC med aktiv HYZR, deretter godkjenn separat
   før eventuell produksjonsaktivering.

## Verifisert 08.11.2026
- Funksjonen ble distribuert i Testing (separat fra ordinær Booking 2.0).
- Eksisterende SQL-preview returnerte `locked` når ingen gyldig betaling var
  aktiv akkurat på spørringstidspunktet.
- GitHub CI dekker kontrakten i `device-status-core.mjs` og tidligere
  varsel-/overstyringslogikk.
- Ingen enhetsnøkkel er klargjort og ingen PC-installasjon gjort.
