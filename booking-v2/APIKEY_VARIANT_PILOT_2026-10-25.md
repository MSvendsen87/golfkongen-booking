# Quickbutik API Secret og sikker variant-test — 25. oktober 2026

## Resultat
- GitHub Actions `GK2_QUICKBUTIK_API_KEY` ble lest (maskert som `***` i loggene). Quickbutik aksepterte nøkkelen for **GET** og **PUT**, dokumentert med etterkontroll i Quickbutik.
- Read-only workflow run [40237493443](https://github.com/MSvendsen87/golfkongen-booking/actions/runs/40237493443), femte forsøk, **success** etter normalisering av Quickbutik-responsene `{product:{...}}` og direkte objekt. 33/33 produkter lest, `newlyCreatedHiddenStockZero=0`, `mode=dry-run`.
- Lesekontrollen telte 1959 manglende SKUer innenfor kontrollens maksimale ramme på 2000 (det er et **begrenset utvalg**, ikke det totale antall 45-dagersvarianter).
- En engangs Quickbutik-skrivetest ble kjørt via GitHub Actions [40238214265](https://github.com/MSvendsen87/golfkongen-booking/actions/runs/40238214265). RUNs rapporterte feil på **etterfølgende produktlesing** fordi Quickbutik raw API returnerte `visible:null` på skjulte produkter, selv om Quickbutik-connectoren returnerte `visible:false`.
- Til tross for feilstatus var **PUT-kallene faktisk gjennomført**. Etterkontroll i Quickbutik:
  - Produkt **1475**, Dart A 30 min: Variant **282446**, SKU `2026-11-01-1100-1130`, pris 80 kr.
  - Produkt **1474**, HYZR 30 min: Variant **282447**, samme SKU, pris 90 kr.
- Begge produkter bekreftet `visible=false`. Variantene hadde `stock=0`, men Quickbutik ga dem default `hidden=false`. Disse to variantene ble **umiddelbart endret** via Quickbutik til `hidden=true`, `stock=0`, `preorder=false`, `allowMinusQty=false`, pris uendret. Etterkontroll viste eksakt én variant per produkt/SKU, begge skjult og utsolgt.
- **Engangs-workflowen `gk2-one-time-pilot.yml` ble slettet fra main** etter testen for å hindre nye PUT-kall.
- Den ordinære rullerende jobben `.github/workflows/gk2-rolling-variants.yml` er bevart på main (dobbelt cron pga. sommertid/vintertid + manuell dispatch), men **GK2_VARIANT_SYNC_WRITE** styres fortsatt via GitHub repo variable og har i siste verifiserte run `false` (tørrkjøring). Push-trigger fra midlertidig tørrkjøring ble fjernet. Ikke slå på bulk-skriving uten å forbedre etterverifikasjonen av Quickbutiks inkonsistente `visible`-felt og ta hensyn til at API `variants.add` lager `hidden=false` som standard, selv om parent er skjult.
- **Aldri logg/commit API-nøkkelen**. Bare GitHub Secret skal ha nøkkelverdien.

## Uavklarte detaljer før bulk-automatikk
- Rullende kalender i Booking 2.0 er databasebasert og viser 45 dager, uavhengig av varianter. Tilgjengelige datoer er ikke det samme som salgbare Quickbutik-varianter.
- Shop API kan gi `visible:"0"` ved første lesing, men `visible:null` ved etterlesing etter `PUT`. Du skal ikke blindt omgjøre null til «skjult» uten verifikasjon.
- For at alle 45 dager skal bli salgbare, må checkout-koblingen og eventuelt lager/variantens hidden-status styres kontrollert. Bulkprewarm `qty=0` alene er IKKE salgbart.
- Faktisk Quickbutik-betalingswebhook, hold, ordre/verifisert gruppepris og Pushover E2E fortsatt ikke testet. Release-gates må være låst og gamle bookinger må respekteres.
