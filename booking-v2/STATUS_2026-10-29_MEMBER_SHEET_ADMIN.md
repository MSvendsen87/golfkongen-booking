# Medlemsark i bookingadmin – 29. oktober 2026
Kilde bekreftet av eierens Apps Script: regneark 17jhezENGfYxgIV-Rzwrippc054vLERH5j4dUwlvXxb8, fanen Medlemmer.
Dette er samme publiserte Apps Script som cold-shadow /club-members bruker.
## Status
Backend v63 og adminmodul klargjort. Aktivering AVVENTER Apps Script-publisering og felles hemmelig nøkkel.
Ingen faktiske medlemsendringer gjort. Ekte ende-til-ende-lagring er ikke testet.
## Aktivering
1. Erstatt hele Kode.gs i eksisterende Golfkongen Klubbliste API med scripts/member-sheet-admin.gs.
2. Lagre. Velg gkOpprettAdminNokkel og Kjør. Godkjenn Googles nødvendige tilgang til regnearket.
3. Prosjektinnstillinger > Skriptegenskaper: kopier GK2_MEMBER_SHEET_SECRET privat.
4. Supabase prosjekt eadgdcimcmfyuicizboo > Edge Functions > Secrets: legg til samme navn og verdi. Ikke legg nøkkelen i chat, GitHub eller nettleserkode.
5. Apps Script Implementer > Administrer implementeringer > eksisterende webapp > blyant > Ny versjon > Implementer. Behold eksisterende tilgang og URL; ikke opprett ny implementering.
6. Oppdater bookingadmin, Rabattgrupper > Medlemslisten – popup og klubbtilgang.
7. Test en reversibel navneendring, kontroller readback i arket og gjenopprett. Test inaktiv status med testkonto.
## Oppførsel
HMAC-SHA256 autentiserer server-til-server POST med tidsgrense 120 sekunder. Admin-endepunktene krever eksisterende verifisert admin.
GET beholder aktive poster og JSON/JSONP-format. Admin POST leser også inaktive.
Samme e-post kan ha flere grupper, men doble rader med samme e-post må avklares i kilden før lagring.
E-post kan ikke endres for eksisterende rad i admin. Ingen sletting; bruk inaktiv. Kun fire kjente kolonner oppdateres.
Optimistisk radversjon, scriptlås, validering og readback. Regnearkredigering utenfor Apps Script bruker ikke scriptlåsen.
Popup/klubbtilgang har eksisterende fem minutters cache. Betalingsgrupper og priser i Quickbutik er separate.
## Avgrensninger
Eksisterende offentlig GET og gammel navnebasert klientmatching er beholdt for kompatibilitet; migrering til autentisert /members/me er fortsatt separat åpent arbeid.
Ingen ny planlagt jobb eller automatisk synk til Quickbutik er lagt til.
## Validering
Åtte lokale tester: eksisterende GET, inaktive, ugyldig/utløpt signatur, readback, foreldet versjon, bevaring av andre kolonner, oppretting og validering; samt popup-regresjon.
