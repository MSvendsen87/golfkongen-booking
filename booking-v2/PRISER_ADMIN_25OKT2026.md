# Booking 2.0 – redigerbare priser, 25. oktober 2026

### Utført direkte
- I eksisterende Supabase `golfkongen-minbag-staging` (prosjekt `eadgdcimcmfyuicizboo`) ble `gk2_private.price_policies` fylt med **264 separate prisutkast**.
- 8 grupper (ordinær + 7 kundegrupper), HYZR/Dart A/Dart B 30–240 minutter (halvtimesintervaller), Hele lokalet 4–12 timer (hele timer).
- Unik indeks for (ressurs, gruppe, varighet) gir én pris per kombinasjon.
- Egen oppdaterings-RPC `public.gk2_admin_save_price` kan overskrive eksisterende pris med ny ørepris uten å lage duplikat. Krever `service_role` + `gk2_is_admin(actor)`; ingen direkte anon/authenticated EXECUTE. Returnerer alltid `quickbutikUpdated=false`. `public.gk2_admin_price_matrix` er lese-API for tillatte administratorer.
- Isolert Edge `gk-booking-v2` versjon 7: `POST /admin/price-save`, alias til gammel `/admin/price-draft` nå upsert; `GET /admin/price-matrix`; gamle feilaktige statiske kundepriser fjernet fra `/admin/checkout-preflight`. Gamle `/hold` og `/checkout` returnerer fortsatt 503.
- GitHub Pages `docs/index.html` fra `booking-v2-preview-2026-10-24` viser kundegruppeprismatrise og redigerbare beløp for en spesifikk aktivitet, gruppe, varighet, med `Lagre / oppdater pris`. Kassekontroll viser ikke lenger foreldet 75/60 kr halvtime-tabell.
- Kildefil for idempotent tarifferstatning og funksjoner lagret i `booking-v2/sql/005_editable_tariffs_existing_project_STAGING_ONLY.sql`. **Ikke kjør migrasjonen på nytt i samme prosjekt uten grunn**.
- Testet direkte i DB i ROLLBACK-transaksjon: Oppdater ansatt-HYZR 30 min fra 1000 til 1100 øre og tilbake, ingen duplikater, ukjent admin avvist, ugyldig varighet for lokale avvist, ansatt lokalet 4 timer 2000 øre bekreftet i RPC. Ikke gjort noen faktisk brukerprisendring i produksjonskasse.

### Eierens nye regler er lagret
| | 30 min | 60 min |
|---|---:|---:|
| HYZR ordinær | 90 kr | 150 kr |
| Dart ordinær | 80 kr | 120 kr |
| Ansatte HYZR | 10 kr | 15 kr |
| Ansatte Dart A/B | 10 kr | 15 kr |
| Betalt disc-medlem + dartklubb: HYZR/Dart | 50 kr | 100 kr |
| Team GolfKongen: HYZR | 50 kr | 100 kr |
| Frisbee + Dart: HYZR | 60 kr | 120 kr |
| Frisbee + Dart: Dart | 50 kr | 100 kr |
| Ambassadører: HYZR | 50 kr | 100 kr |
| Frisbeeklubber: HYZR | 60 kr | 120 kr |
| Dartklubber: Dart | 50 kr | 100 kr |

**Ansatte hele lokalet:** 4 timer = 20 kr, deretter 10 kr per ekstra HELE time (5 timer 30, 6 timer 40 etc). **Ordinær hele lokalet:** eksisterende 800 kr for 4t +200 kr per ekstra time, og øvrige grupper får denne prisen frem til eget avvik settes.

### Pris for 90+ minutter
Foreløpig kombineres hele timer med eventuell 30-minutterspris: f.eks ordinær HYZR 90 min 240 kr, 120 min 300 kr, ansatte HYZR 90 min 25 kr og 120 min 30 kr. Dette er redigerbare UTKAST; ikke la sluttsummen vises som lovet pris før kundekasse verifiserer den og eier bekrefter pris for kombinasjonsvarighet.

### Sikkerhet og betaling
- *Ingen* Quickbutik-produkt-, variant-, gruppepris- eller rabattendringer utført i denne prissettingsoppgaven.
- `gk2_private.price_policies.active=false` for alle 264. `release_gates` er fortsatt låst, `gk2_private.qb_catalogue_mapping.checkout_enabled=false`. Gamle Pushover i Make/Cloudflare urørt. Ansattes gamle 98 % Quickbutik-rabatt er **ikke** det samme som nye faste priser (10/15 kr); må verifiseres for å unngå dobbelt rabatt.
- Public/Min Bag 51 tabeller urørt, og ingen `anon`/`authenticated` tabellgrant i `gk2_private`.
- Kundegruppekodene (f.eks `betalt_medlem`, `frisbee_dart`) er interne Booking 2.0-koder. Eksakt mapping mot Quickbutik syv kundegrupper og popup-medlemsregister må testes før pris kan beregnes for innlogget kunde.
- Quickbutik produkt 1474/1475/1476 fortsatt skjult, lager 0, pris 0 (test), ikke åpnet for kjøp.

### Neste praktiske test
1. Eier åpner https://msvendsen87.github.io/golfkongen-booking/ , Ctrl+Shift+R, fanen **Priser**.
2. Se rad **Ordinær**: HYZR 30/60 = 90/150, Dart = 80/120.
3. Velg **Ansatte**, **Hele lokalet**, **4 timer**: 20 kr; **5 timer**: 30 kr. Test gjerne å justere en STAGING-pris i UI og sette tilbake (uten å endre Quickbutik).
4. Deretter: Sikker mapping av kundegrupper og serververifisert Quickbutik-kasse før ny betalingsfunksjon aktiveres.
