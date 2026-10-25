# Booking 2.0 – fortsettelsespunkt for neste arbeidsøkt (25.10.2026 eller senere)

## Status
- Produksjon urørt. IKKE deploy, migrer eller endre Quickbutik nå.
- Visuell HTML-demo for kunde og admin er laget og fungerer offline. Brukeren liker utformingen, så BEHOLD designet.
- Opprinnelig utviklingsgren: `booking-v2-preview-2026-10-24`. `booking-logic.mjs` og tester finnes i denne grenen.
- Oppdatert samtalepakke: `GolfKongen_Booking_2_0_forhandsvisning.zip`, med HTML-demo, 26 kjernelogikktester, 34 tester av simulerte reservasjoner/checkout, skisse til databaseskjema (`ROLLBACK`, ikke kjør) og arbeidsnotater.
- HTML-demoen er ytterligere sikret med escaping for administrativt skrevet tekst uten visuell redesign.

## Vedtatt
- Bare én HYZR-simulator, pris per simulator/tidsrom, aldri per deltaker.
- Dart A og Dart B kan bookes hver for seg.
- Leie av hele lokalet tar HYZR + begge dartbanene.
- Vanlig booking må ha 30-minutters mulighet, 60 minutter eller flere timer.
- Vinterliga/turneringer lavere prioritet; tre beste av ubegrensede forsøk ved senere oppsett.

## Dagens regler som må bevares
- Aktive Supabase-sperringer for HYZR (produkt 1320) og hele lokalet (1349) frem til og med 31.10.2026; dart A/B forblir tilgjengelige.
- Eksisterende betalte bookinger skal bevares.
- Kjente regler: jul 24.–25.12; hele-lokalet-stenging lørdag 10–16; klubbkveld torsdag 19–22 med frigivelse tirsdag 00:01 hvis ingen er påmeldt.
- Ikke bruk Quickbutik variantlager=0 som bevis på betalt booking. Lager=0 kan også komme av stenging.

## Viktige tekniske forberedelser
- Del opp statuses: held / payment_pending / confirmed / expired / cancelled / paid_unallocated / refunded.
- Server skal atomisk låse hver 30-minuttersressurs i databasen; browser-kontroll er bare presentasjon.
- Betalingsbekreftelse må validere ordrenummer, riktig beløp, status og signert/autorisert kilde. Ubetalt handlekurv bekrefter ikke booking.
- Dersom betaling er forsinket etter at hold er utløpt, må den gå til manuell avklaring/refusjon, ikke opprette en dobbelbooking.
- Idempotente betalinger og hendelser. Statushendelser og adminendringer loggføres.
- Quickbutik dokumentasjon bekrefter at ordrenummer tildeles ved besøk i checkout og at ubetalte ordre kan ligge igjen: https://quickbutik.com/no/hjelp/hvorfor-er-ikke-ordrenummerne-mine-i-rekkefolge
- Quickbutiks faktiske støtte for dynamisk bookingpris og verifisert webhook/API er ennå IKKE verifisert. Ikke bygg produksjonscheckout på antakelser.

## Neste arbeidsrekkefølge når brukeren er klar
1. Bekreft at demoens kundevisning og admindesign fortsatt er ønsket.
2. Bestem priser: HYZR 30/60/90/120+, dart 30/60+, lokalet 4 timer og påslag.
3. Bekreft bookinghorisont, cutoff, avbestilling og maks lengde (forslag: samme 40 dager / 20-min cutoff som eksisterende).
4. Kartlegg produksjonsbetalingen i Quickbutik og test med kontrollert testordre uten å forstyrre kunder.
5. Implementer isolert server-API + transaksjonell slot-reservasjon, RLS og adminroller. Test parallellbestillinger og migrering med read-only data først.
6. Test på staging/forhåndsvisning, få eksplisitt godkjenning og planlegg kontrollert overgang/rollback.

Ingen faktisk produksjonsmigrering er autorisert per nå.

## Kritisk: Pushover-varsler må beholdes
- Eier bekreftet 24.10.2026 at Pushover ved booking allerede fungerer og skal videreføres uendret i brukeropplevelsen.
- Egen detaljert migrerings- og testspesifikasjon: `booking-v2/PUSHOVER_VIDEREFORING.md`.
- Tidligere fungerte separate Make-scenarier med SuperSaaS-webhooks (simulator, dart, klubbkveld). Nåværende trigger er ikke verifisert i dagens JS-kode. Kartlegg produksjonsflyten, ikke anta at Make/SuperSaaS fortsatt brukes.
- For produksjon er det et stoppkrav at en gyldig, betalt booking sender **ett** Pushover-varsel med riktig ressurs, dato/tid og pris. Halvtimer skal ikke sende ett varsel per blokk. Ikke push på ubetalt ordre eller admin-stenging.
- Behold Pushover-konto og hemmeligheter privat; ingen nøkler i frontend eller GitHub. Test varsling etter ny betalingsflyt, men rør ikke dagens varsling før dette er kontrollert.

## Obligatorisk: gruppepriser og innloggingsrabatter
- Eier bekrefter at GolfKongen har **ansattpriser, klubbpriser, Team GolfKongen-priser og flere rabattordninger**, basert på hvem som er innlogget. Dette er kritisk å videreføre, i tillegg til ordinære rabattkoder.
- Fullstendig kravspesifikasjon: `booking-v2/PRISGRUPPER_OG_RABATTER.md`.
- Før produksjon kartlegg alle grupper, medlemskilde, rabattsammenlegging, gavekort og Quickbutik checkout-pris. **Ikke anta at de tre navngitte ordningene er hele listen.**
- Autorisert innlogging og faktisk gruppeprivilegium skal kontrolleres server-side. Test både gjest, ansatte, klubber, Team GolfKongen, sammensatte grupper og forsøk på prismanipulering.
- Ingen aktivering uten at alle eksisterende rabattordninger som gjelder booking fungerer og er testet.

## 25.10.2026 – eksisterende medlemsregister og popup funnet, sentral admin demonstrert
- **Bruk funnet eksisterende ark**: `Lyngdal Dartklubb medlemsliste`, fanen `Medlemmer` (Google Sheets-id `17jhezENGfYxgIV-Rzwrippc054vLERH5j4dUwlvXxb8`), 24 aktive oppføringer per read-only-kontroll. Ikke lag kopiregister!
- Eksisterende `MSvendsen87/gk-member-popup.js` bygger popup på `/customer/index`, medlemdata fra Cloudflare `/club-members`; `MSvendsen87/ldk-clubgate` leser samme endepunkt.
- **Kritiske forskjeller**: Sheets bruker gruppe-koder i kombinasjoner, mens Quickbutik har 7 kundegrupper og egne rabattregler. Workerens direkte kobling til Sheet er ennå ikke beviselig verifisert.
- Dagens popup `findMember` tillater matching på bare navn – ikke bruk dette til sikker tilgang eller rabatt. `resolveBenefits` prioriterer bare ett butikkfordelstekstfelt, så kombinert frisbee+dart kan vises ufullstendig. Begge må rettes i kontrollert neste versjon, ikke produksjonskode direkte.
- Eget GitHub-arbeidsnotat: `booking-v2/MEDLEMSSENTER_KARTLEGGING.md`.
- **Eksisterende Booking 2.0-forhåndsvisning utvidet** som ny nedlastbar `booking-v2-members-preview.html` + zip `GolfKongen_Booking_2_0_medlemssenter_demo.zip` med admin-fanen `Medlemmer & fordeler` (oversikt, fiktive medlemmer med CRUD, gruppepriser, popup-forhåndsvisning). Testet Chromium desktop/mobil og sikret at HTML fra testmedlemsnavn escapes. Endringer gjelder bare lokal demo, ikke live. Behold dette visuelle oppsettet, ikke bygg en ny separat admin.
- **Neste reelle steg**: undersøke Cloudflare Worker-koden/Apps Script-mapping, Quickbutik-tilgang til sikre customer groups API, og etablere trygg synkverifisering; må kontrollere ekte kassebeløp før medlemshåndtering kan endre rettigheter live. Ikke bruk usikre nettlesermatcher, og ikke skriv personopplysninger til repo.
