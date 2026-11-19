# Booking 2.0 – kontrollert utviklingsstatus 26.10.2026

## Spørsmål avklart: ekte Quickbutik ordre 3702
- V1 `GET /v1/orders?order_id=3702&include_details=true` viser `status=2`, produkt 1349, SKU `2026-10-24-1700-2100`, `total_amount=800.00`, men **ingen** `discount_amount` eller `total_pay_amount`.
- Quickbutik-tilknyttet ordreoppslag gir `amounts.total=80000 øre`, `amounts.discount=78400 øre`, `amounts.paid=1600 øre`, `paymentStatus=paid`.
- **V1 total_amount er brutto, ikke pålitelig betalt beløp.** Aldri merk V1-brutto som innbetalt. Den installerte betalingstesten skal avslå når nettobeløp ikke er etterprøvbart.
- Et autoritativt servertilgjengelig nettobeløp mangler fortsatt i deploybar Quickbutik V1. Denne tekniske hindringen MÅ løses før betalt order.new bekrefter en kunde og gir Nuki-kode; ingen ny testbetaling nødvendig for å bekrefte feilen.
- Quickbutiks 2026 API-dokumentasjon viser V1 total_amount, status, products ved include_details men dokumenterer ikke en garantert netto-verdi i alle svar. Se https://quickbutik.dev/api-v1/orders/get-orders.

## Opprettede ekte skjulte tidsvarianter og kalenderplan
- Quickbutik direkte via tilkoblet merchant-API: ALLE 33 dedikerte Booking 2.0-produktene (1474–1506) har nå `hasVariants=true` og `visible=false`. Tidligere var bare 8 produktvarianter klargjort.
- De resterende 25 produktene har fått valg `Velg dag` og `Velg tidspunkt` med eksempelvariant 2026-11-02, start 10:00, varer til aktuell varighet. Hver ny variant ble kontrollert via nytt `get_product` og har `hidden=true`, `stock=0`, `preorder=false`, `allowMinusQty=false`. Legacy-produktene og gamle bookinger urørt.
- **Dette er grunnoppsett, ikke ferdig 45-dagersvariantdekning!** Planen i `booking-v2/data/quickbutik-duration-manifest.json` har 33 produkter og om lag 25 785 mulige start/varighetskombinasjoner ved 45 dager. Kalenderen i Supabase ruller allerede 45 dager, men Quickbutik har ikke samtlige SKU-er.
- Ny ren planner og sikkerhetskontroll i `booking-v2/scripts/safe-variant-plan.mjs` med Node-tester `safe-variant-plan.test.mjs`, integrert i CI. Tester bekrefter kalender-/SKU-generering, unike manglende varianter, idempotent plan, prioritert nyeste dato og fail-closed dersom produkt-/variant-skjuling, lager eller pris ikke kan bekreftes. Ingen uautorisert API-skriving.
- `quickbutik-rolling-sync.mjs`: i DRY-RUN tillates nå `visible:null` (V1 API kan returnere null for skjult produkt) med tydelig varsel. **WRITE er fortsatt blokkert**. En ukjent visible-verdi skal ALDRI brukes til å autorisere skriv.
- V1 `variants.add` har i eldre pilot ikke bevart skjult=true. Ingen fullstendig trygg bulk-writer for 25k skulte variant-SKU-er er verifisert. Produktet er for tiden skjult og ingen varer kan kjøpes.

## Beholdte sperrer og videre prioritet
- Alle 8 release-gates står FALSE og Quickbutik nye parent-produkter forblir `visible=false`. Supabase bekreftelseswebhook er av, selv om staging Edge-kode finnes.
- Først løses trygg automatisk variant-opprettelse (med eksakt SKU/hidden/stock readback) OG pålitelig server-side bekreftelse på **faktisk nettopris** fra Quickbutik eller annen autoritativ oppdatert betalingskilde; alternativt avklares en akseptert provider-paid-status-strategi med eksplisitt korrekt bokføring. Ikke aktivér så lenge usikkerhet gjenstår.
- Så checkout/hold/ordre-binding, pilsett/vilkår/prisgrupper, legacy-ordresynk, Pushover outbox, Nuki-tilgang og epost, fysisk test, mobile2e og cutover.
- Neste eierhandling kun hvis teknisk API ikke kan få betalt nettobeløp: Be Quickbutik opplyse korrekt autentisert API-endepunkt for `amounts.paid` / rabatt/kupong for betalt `order_id`, samt støttet API for å opprette skjult variant. IKKE send API-nøkler eller persondata til support. Bruk ordre 3702 som eksempel på et avvik, uten kundedata.
