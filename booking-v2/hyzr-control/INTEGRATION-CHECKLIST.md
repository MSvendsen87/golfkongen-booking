# HYZR-integrasjon – gjeldende status og reell utrulling (08.11.2026)

## Fysisk PC – godkjent
- HYZR kjører som `Hyzr.exe` + `HyzrLauncher` på Windows 10 Home, 1920×1080.
- Tester med reelt HYZR-spill viser at vinduer kan legges over spillet.
- Velkomst → fireminuttersvarsel → utløptmelding → skjermsperre fungerer i demo.
- HYZR fortsetter under sperreskjermen: det finnes foreløpig **ingen autorisert spillstopp/reset**, og overlegg alene er ikke sabotasje- eller omgåelsessikkert.

## Ekte status – distribuert i Testing
- Edge Function: `gk2-hyzr-device-status` i Supabase-prosjekt `eadgdcimcmfyuicizboo`.
- Lesebeskyttet, krever tilfeldig 256-biters enhetsnøkkel (råverdi bare lokalt på PC, SHA-256-hash som Edge Function-secret).
- Den returnerer minimal serververifisert bookingstatus fra `gk2_hyzr_preview_state`.
- **Blokkert inntil enhetsnøkkel er satt**; `deviceControlEnabled=false` og `qrPaymentEnabled=false` er hardkodet.
- Windows 10-monitor er bygget som `GolfKongen-HYZR-PC-Monitor-Testing.zip` og følger som samtalevedlegg, med `OPPRETT-PC-NOKKEL.bat` og `START-BOOKINGOVERVAAKING.bat`.
- Monitor bruker DPAPI for å kryptere enhetsnøkkelen lokalt, HTTPS og monotont tidsvindu på maks 6 sekunder. Den gjør **ingen endringer** i HYZR, Windows eller booking.
- Hand-off ved ny booking-ID er bare en indikator, inntil HYZR kan nullstilles på dokumentert måte.

## Betaling – utviklingskode, ikke distribuert
- Vipps ePayment **QR** er støttet, bruker `userFlow: QR`, `WALLET`, `customerInteraction: CUSTOMER_PRESENT`.
- `vipps-extension.mjs` bygger opprettelsesforespørsel; `vipps-settlement.mjs` krever bekreftet fullstendig capture fra Vipps GET før forlengelse i Booking 2.0.
- Ingen Vipps-ePayment-nøkler, MSN, webhook, reserve/capture eller betaling er aktivert.
- Forlengelse må først reservere tidskapasiteten i **samme transaksjon/låseprotokoll som Booking 2.0**; det er ikke tilstrekkelig å stole på preview quote eller klienten.
- Ingen klippekortforlengelse før klipp trekkes atomisk.
- Gjelder også rabatter: originale faktisk betalte øre/minutt skal beholdes.

## Gjenstående sperrer
1. Registrer enhetsnøkkel på HYZR-PC og tilhørende hash i Supabase Testing > Edge Functions > Secrets som `GK2_HYZR_DEVICE_TOKEN_SHA256`. Ikke røp rånøkkel i chat eller repo.
2. Verifiser ekte status med monitorprogrammet i Testing for en fremtidig bekreftet booking, og ved ledig kapasitet.
3. Få dokumentert metode fra HYZR for trygg retur til startsiden/nullstilling av den forrige kundens økt. Ikke avslutt `Hyzr`/Windows vilkårlig.
4. Få tilgang til Vipps ePayment for riktig salgssted, lagre MSN og API-nøkler kun i Secrets.
5. Implementer atomisk kapasitetshold, betalt Vipps capture, idempotent webhook/polling og commit før ny sluttid sendes til PC-en.
6. Test ekte kunde→kunde-handover, ny booking under margin, kansellering, nettbrudd, vedlikehold og stengetid.
7. Egen godkjenning av driftsutrulling. **Ikke merge draft PR #4 eller aktiver sperring før punktene er løst.**

## Læring
- Windows-agenten kommer fra de godkjente skjermtestene og er en ny fase: faktisk serverlesing fremfor simulert nedtelling.
- Det finnes foreløpig ingen grunn til å lage flere ZIP-demoer. Bruk den samme monitoren frem til tilkobling er verifisert.

## Reell Quickbutik-betaling avstemt (08.11.2026, kveldsrunde)
- `gk2_confirm_paid_order_status` bruker verifisert Quickbutik V1 betalt-status, men setter `paid_ore=NULL` bevisst fordi nettopris ikke alltid kan avledes fra V1-gross. Dette er **ikke** en gratis booking.
- Gammel `gk2_hyzr_preview_state` krevde `paid_ore IS NOT NULL` og ville derfor feilaktig låst ekte, bekreftede betalinger. Rettet i migration `051_gk2_hyzr_allow_verified_paid_without_amount.sql`, distribuert i Testing med kontroll på 11. november: `active` under betalt økt, `grace` etter slutt, `locked` etter 10 min.
- Utvidelsesvalg for ukjent nettopris forblir skjult/ikke betalbart. Ikke gjett beløp eller bruk ordinær katalogpris.
- Ordre **3774** kontrollert mot Quickbutik direkte: HYZR 11.11 kl. 14:30–16:30, status paid, Qliro, ingen rabatt/refusjon, 300 NOK, riktig kunde og SKU. `paid_ore=30000` oppdatert under full guard med booking-ID/order/slot/status og verifisert etterpå; ingen andre bookingrader endret. Forlengelse 30 min gir 75 NOK i read-only quote.
- `quickbutik-paid-amount.mjs` og tilhørende tester bygger en streng verifier for faktisk V2-netto; ennå **ikke** koblet til automatisk avstemming av fremtidige ordrer. Krever egen servertilgang til trygg Quickbutik V2-data eller annet verifiserbart nettobeløp. Integrasjonen må IKKE forsøke å rekonstruere nettopris fra gross uten dokumentert rabatt.
- Separat `gk2-hyzr-device-status` Edge Function **versjon 2** har en autentisert read-only `/options` som beregner 30/60/90/120-minutters prislister fra `gk2_hyzr_extension_quote`. `paymentReady=false`; ingen hold, Vipps-kall eller PC-styring. Fortsatt blokkert av manglende enhetsnøkkel på server.
- Ingen endring i live `gk-booking-v2` edge function. Ikke publiser pris-QR før betaling og tidsreservasjon er atomisk implementert.

## Avhengigheter før oppstart (fremdeles)
1. Nøkkel-filen på simulator-PC er persistent under samme Windows-profil. Hash må hentes lokalt og lagres i Testing Secret; **ikke generer ny nøkkel**.
2. HYZR-leverandør må dokumentere en trygg kommando/API for å avslutte forrige spill eller gå til startsiden uten å krasje sensorer, launcher eller Windows.
3. Vipps ePayment API-salgssted og nøkler må aktiveres i rett bedrift. Ingen credentials i GitHub eller chat.
4. Atomisk kapasitetshold under Booking 2.0s felles dato-advisory-lock og `claims`-unikhet, med verifisert Vipps capture/klippekort debit før bookingoppdatering.
5. Server-side faktisk nettoprisavstemming for senere bookinger. Test rabattordrer, ikke bare en ordinær ordre.
