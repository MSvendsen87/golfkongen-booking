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
