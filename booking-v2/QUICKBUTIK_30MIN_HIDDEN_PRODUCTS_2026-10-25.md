# Booking 2.0 – Quickbutik skjulte halvtimesprodukter (25.10.2026)

## Status: faktisk opprettet, ikke åpnet for salg

Kassekontroll 01.11.2026 viste 0/24 halvtimesvarianter, og 12 gamle timesvarianter per produkt. Det skyldes at dagens produkter er 60-minuttersvarianter.

Opprettet via tilkoblet Quickbutik (ikke i Min Bag):
| Ressurs | Gammelt levende bookingprodukt | NYTT usynlig testprodukt | Ny testvariant-ID |
| --- | --- | --- | --- |
| HYZR | 1320 | **1474** | 282439 |
| Dart A | 1316 | **1475** | 282440 |
| Dart B | 1317 | **1476** | 282441 |

- Alle 3 nye produkter `visible=false`, `price=0`, ingen kategori, egne option-typer `Velg dag` og `Velg tidspunkt`.
- Alle testvariantene har SKU `2026-11-01-1000-1030`, `hidden=true`, `stock=0`, `price=0`, `allowMinusQty=false`. Dette ble re-verifisert ved `get_product`.
- Gammelt produkt HYZR/Dart hadde `taxRate=0`. Ved opprettelse fikk nye produkter ved en feil 25, men dette ble umiddelbart korrigert til `taxRate=0` og re-verifisert. **Dette er bare likhet med gammel booking, ikke en juridisk vurdering av riktig MVA-sats.** Få dette kontrollert før salg.
- De gamle 1316/1317/1320/1349-produktene, de opprinnelige kundegruppeprisene og aktiv Pushover/Make er helt urørt.
- Nye produkter har INGEN kundegrupperabatter konfigurert, og må ikke aktiveres før disse er verifisert i ekte Quickbutik checkout. Quickbutik bruker produktbaserte spesialpriser for grupper som kan overstyre generelle priser: https://quickbutik.com/no/hjelp/hvordan-tilpasser-jeg-priser-for-en-kundegruppe
- Supabase: i eksisterende `golfkongen-minbag-staging` er `gk2_private.qb_catalogue_mapping` opprettet og fylt med ID-er. `checkout_enabled=false` for alle tre; lanseringslås har fortsatt ingen godkjente gates, ingen produksjonsordre kan lages.
- `gk-booking-v2` Edge API v6 har en read-only admin-kassekontroll for både gamle (timeslot) og nye skjulte produkter, samt bare et pristabell-UTKAST basert på tidligere oppgitte 60min priser. Fanen Kassekontroll i `docs/index.html` viser både gamle og nye og foreslåtte halvtimespriser. Kun godkjente adminkontoer ser innholdet via serverautorisasjon.
- Bekreftede kontrollverdier: 3 nye mappings, 0 checkout-åpne mappings, 0 lanseringsgates åpne, 51 eksisterende Min Bag-tabeller urørt, 24 half-hour claims for betalt venue booking 31. oktober fortsatt bevart. Ingen andre live kjøp/varsler endret.
- GitHub Pages deploy for siste Edge-kildesynk + frontend vellykket (Actions run 40224591499).

## Foreslått – IKKE bekreftet – lineær halvtimesprising

Basert på spesifiserte timerater:
| Kundegruppe | HYZR pr 30 min | Dart pr 30 min |
| --- | ---: | ---: |
| Ordinær (150/120 per time) | 75 | 60 |
| Betalt disc-medlemskap + dartklubb | 50 | 50 |
| Team GolfKongen | 50 | 60 |
| Frisbee + Dart | 60 | 50 |
| Ansatte (98 % rabatt) | 1,50 | 1,20 |
| Ambassadører | 50 | 60 |
| Frisbeeklubber | 60 | 60 |
| Dartklubber | 75 | 50 |

Bare forslag, ikke faktisk endring i Quickbutik, og opptjening/medlemskap i Google Sheets uendret. For 60,90,120 min må 2,3,4 halvtimer summeres og gruppens totalsum kontrolleres i Quickbutiks kasse.

## Kritiske gjenværende steg

1. Eier godkjenner om halvtimer skal prises helt forholdsmessig. Sjekk MVA-sats og ansattrabattens avrundingsregler.
2. Lag idempotent tidsvariant-synk for nye produkter, **kun hidden=true,stock=0** til checkout-, gruppepriser og anti-dobbelbooking er E2E-testet. Unngå å legge 2880 varianter manuelt eller endre gammel Cron uten rulltilbake.
3. Konfigurer nye skjulte produkters spesialpriser i Quickbutik per kundegruppe (eller dokumenter trygg API-metode). Grupper må gjelde nye produkt-ID-er; de kopieres ikke automatisk.
4. Bygg komplett 30-min hold -> flerlinje-cart -> paid-order verification -> release/finalize, med én booking-ID og Pushover én gang etter betalt ordre. Ingen gammel Worker er endret.
5. Trygg all-or-nothing cutover: sperr gamle direkte booking-URL-er, gamle Quickbutik-varianter/kjøp og gamle Cron synk, importer gyldige bookinger, åpne nye produkter, verifiser rollback.

**Neste manuelle test:** Oppdater https://msvendsen87.github.io/golfkongen-booking/ og gå til Kassekontroll 01.11.2026. Bekreft «skjulte nye produkter» og forslag til halvtimepris. Ingen produkt-/prisskriving er tilgjengelig fra adminfanen.
