# Medlemssenter for GolfKongen Booking 2.0 — teknisk kartlegging og løsningsdesign

Dato: 25. oktober 2026. **Utviklingsgren, ingen produksjonsendringer.**

## Kilder funnet — ikke lag nye datakilder

1. **Eksisterende medlemsregneark**: [Lyngdal Dartklubb medlemsliste](https://docs.google.com/spreadsheets/d/17jhezENGfYxgIV-Rzwrippc054vLERH5j4dUwlvXxb8/edit), fanen `Medlemmer`. Kolonnene er `Navn | Email | Gruppe | Aktiv`. Ved lesning 25.10.2026: **24 aktive oppføringer** og flere gruppetilhørigheter per oppføring. Sist endret ifølge Drive-metadata: 06.04.2026. Personnavn/e-post skal IKKE kopieres til GitHub, demo eller klientlogger.
2. **Innloggings-popup**: [gk-member-popup.js](https://github.com/MSvendsen87/gk-member-popup.js/blob/main/gk-member-popup.js) (801 linjer). Vises på `/customer/index` ved innlogging. `CONFIG.showEveryLogin=true`. Henter medlemsposter fra Cloudflare Worker `/club-members` og viser fordeler etter lokale `CONFIG.groups` + prioriteringer.
3. **Tilgang til dartklubb-kveld**: [ldk-clubgate/clubgate.js](https://github.com/MSvendsen87/ldk-clubgate/blob/main/clubgate.js), bruker samme `/club-members`-endepunkt og kjenner gruppeverdiene `dartklubb`, `ansatte`.
4. **Quickbutik** har 7 kundegrupper, egne rabatter og handlekurvbasert checkout. Disse er **betalings- og rabattmyndighet**, ikke popuptekst. Gruppespesifikke rabatter opprettes i Quickbutik separat fra «generell kundegruppe-rabatt» og kan være synlige først i kassen. Derfor står f.eks. generell prisjustering 0 for Ansatte selv om aktive rabatter finnes.

### Viktig: proveniens og driftsverifikasjon
Worker-koden for `/club-members` er ikke funnet/inspektert. Vi har funnet sannsynlig kildesheet og koden som bruker Worker, men har **ikke bevist** at Worker i produksjon leser akkurat dette Sheet akkurat nå. Avklar før implementert synk. Ikke overstyr Quickbutik-gruppene med Sheet bare fordi gruppenavn ser like ut.

## Gruppekoder i eksisterende Sheets/popup
Dagens regneark representerer flere **kombinasjoner** av disse kodene, og ikke nødvendigvis én rad med én av Quickbutiks sju gruppeetiketter:
- `ansatte`, `teamgolfkongen`, `ambassador`, `medlemmer`, `frisbeeklubb`, `dartklubb`.
- `frisbeeklubb,dartklubb` tilsvarer kombinerte fordeler fra Frisbee + Dart.
- Betalt medlemskap+darts kan omfatte `medlemmer,frisbeeklubb,dartklubb`. Verifiser gruppemapping før synk; ikke gjett ut fra navn.
- Enkelte personer har flere grupper. Én kunde kan ha forskjellige fordeler for simulator, dart og produkter.

Gruppenes **avtalte bookingpriser** er dokumentert i `PRISGRUPPER_OG_RABATTER.md`. Ansatte: 98 % rabatt på all booking + 30 % butikkvarer. Ikke bland disse. Per-time-faste priser gjelder i utgangspunktet 60 minutter; 30/90/120+ må godkjennes separat.

## Konkrete funn og feilrisiko i gammel popup

- Popupens `findMember` matcher aktivt medlem med e-post **eller bare tilsvarende navn**. Dette er uegnet som grunnlag for privilegier; navn er ikke en sikker identifikator. For medlemsadministrasjon og tilgang kreves verifisert konto/identitet server-side.
- Popupens `resolveBenefits` velger **kun én** `retailText` basert på høyeste `retailPriority`, selv ved kombinerte `frisbeeklubb`+`dartklubb`. Dermed kan en kunde få vist bare én av to butikkfordeler. Separat prislinje per aktivitet finnes og fungerer annerledes. Rettes i NY testet popupversjon senere, ikke endre live-koden blindt.
- Popup-tekster er hardkodet i `CONFIG.groups`; rabattordningene er i Quickbutik. Dette er drift av to parallelle regelsett og en kilde til avvik.
- Popup og klubbtilgang henter en **full medlemsliste** i nettleseren fra Worker uten en synlig autorisert brukerforespørsel til Worker i disse to JS-filene. Dette er en mulig personverns-/tilgangssvakhet. Før produksjonsutvidelse: inspiser Worker faktisk, reduser data som eksponeres offentlig, fjern navnefallback for privilegier, og bruk sikre adminendepunkter. Ingen eksisterende funksjon skal slås av før trygg erstatter er testet.
- Popupkoden har `CONFIG.debug=true` og logger `identity`/`member` til konsoll. Skru av sensitive logger i den fremtidige versjonen etter test.

## Foreslått Medlemssenter i GolfKongens EGEN admin (ikke Quickbutiks leverandørpanel)

En ny fane **Medlemmer & fordeler** i Booking 2.0-admin, basert på eksisterende design:
- Oversikt med syv Quickbutik-grupper, gruppemapping, timepriser, butikkfordeler, medlemsantall og popuptekst.
- Søk/filtrer medlemmer, se aktive/inaktive/utløpte medlemskap og historikk.
- Legg til/endre/fjern medlemskap, med forhåndsvisning, bekreftelse, logg og rollebundet tilgang. Endring skal bruke eksisterende primærkilde (Sheets/Apps Script eller migrert betrodd backend), og kvittere for *faktisk* lagret endring.
- En Quickbutik-tilkoblingskolonne med synkstatus: `I samsvar`, `Avvik`, `Ukjent`, `Venter på synk`. Betalingsfordeler skal **aldri regnes aktivert** bare fordi et Sheet ble endret.
- Egen «Forhåndsvis innloggings-popup» som viser **alle gjeldende fordelstyper** uten å utelate separate rabatter.
- Redigering av visningstekster og bookingpriser må være koblet til autoritative kilder; innhold i popup er informativt, mens Quickbutik bekrefter faktisk pris.

**Viktig:** Quickbutik-integrasjonen tilgjengelig her har ikke list/update kundegruppe-medlemskap som klare handlinger. Derfor er det ikke implementert **ekte** direkte synk nå. Må verifisere API-/Worker-kapasitet eller bevare Quickbutik som obligatorisk administrasjonssteg til vi kan koble sikkert.

## Lokal, trygg design-demo
`booking-v2-members-preview.html` (samtalevedlegg) utvider allerede godkjent Booking 2.0-visning uten redesignet:
- Ny adminfane med syv gruppepriser og tilleggsrabatter.
- Legg til, endre og fjern **fiktive testmedlemmer** i lokalt minne, med e-postvalidering og gruppemultivalg.
- Rediger gruppenes demo-priser og butikkfordeler, vis kombinert popup for valgt testmedlem.
- Ingen ekte medlemsnavn, ingen nettverkskall, ingen live lagring, ingen Quickbutik/Pushover/endring av Cloudflare.
- Testet i Chromium: desktop 1440px og mobil 390px, både CRUD, gruppematrisen, redigering av pris, popupoppdatering og HTML-escaping.

## Testkrav før live adminendringer
- Sammenlign Sheets-rader med gjeldende Worker-resultat, uten å eksponere navnelister.
- Sammenlign de sju Quickbutik-gruppene med medlemskoder. Gruppene er ikke 1:1 i Sheet.
- Verifiser autorisasjon server-side som GolfKongen-eier; admin-CRUD med tilgangslogg.
- Verifiser idempotent medlems-ID (helst Quickbutik customer ID, ikke navn som nøkkel) og ingen dupliserte medlemmers rettigheter.
- Test gruppeendring → Sheet/Worker → popup → Quickbutik-kasse. Refunder/angre testordre ved behov. Gjest og falsk e-post skal aldri få rabatter.
- Bevar eksisterende bookinglogikk og Pushover-varsler. Ingen produksjonsdeploy før dette og kassesteg er godkjent.
