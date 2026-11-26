# Booking 2.0 – teknisk grense nådd uten testmiljø

**Oppdatert:** 24.10.2026. **Produksjon:** urørt. Ingen deploy, betaling, nye bookingvarianter, adminregler, push eller databaseskjema endret.

## Nytt reelt arbeid etter siste sjekkpunkt

Vi kartla Quickbutiks **faktiske ordreformat** read-only gjennom integrasjonen og sammenlignet relevante, eksisterende ordrer med intern kopidatabase.

1. En historisk simulatorordre med `paidAt` i den interne kopien var i selve Quickbutik markert `paymentStatus=voided` og `fulfillmentStatus=cancelled`. KUN oppdatert status fra autoritativ ordre kan fastslå betalt booking. Variantlager 0 eller betalt-dato i kopien er ikke nok.
2. Eksisterende reservasjon av hele lokalet **31.10.2026, 18–22** er gyldig betalt selv om en senere administrativ regel nå sperrer perioden for *nye* bookinger. Betalte eldre bookinger **bevares** og markeres for særskilt kontroll ved konflikt med nyere stengeregel.
3. Virkelige Quickbutik-ordre kan ha varepris 800 kr og faktisk betalt 16 kr etter stor rabatt. Bookingens pris- og betalingskontroll må støtte **serververifiserte rabatter**, og ikke feilaktig kreve at ordinær varepris er lik faktisk betalt beløp.

## Nye, ikke-overlappende moduler i samtalens nedlastbare testpakke

- `legacy-reconciliation.mjs`: read-only import av gjeldende betalte Quickbutik-bookinglinjer, kontroll for annullering, delvis refundering, duplikat, dato og fysisk konflikt.
- `legacy-rules.mjs`: oversetter gamle `gk_booking_rules` til separate ressursblokker. Produkt 1349 stenger **bare muligheten for å leie hele lokalet** og stenger ikke automatisk HYZR/dart. Dermed bevares dagens butikkåpent-regel lørdag 10–16.
- `pushover-outbox.mjs`: separat varslingshendelse etter faktisk bekreftet betaling, ingen push ved bare handlekurv. Idempotent hendelsesnøkkel, logg, kontrollert retry, manuell verifisering ved ukjent leveringsresultat.
- `booking-flow-simulation.mjs` rettet til å sammenligne faktisk betaling mot **serververifisert checkout-beløp** (ikke ordinær listepris). Rabatt krever et autentisert checkout-bevis i den fremtidige backend, ikke en verdi fra nettleseren.
- `migration-preflight.test.mjs` krysser regeltolk, ordreimport og Pushover på anonymiserte testdata.
- Oppdaterte og nye tester: **157 bestått totalt** (26 tilgjengelighet + 34 original betaling + 29 legacy ordre + 19 legacy regler + 33 Pushover + 10 integrert + 6 rabatt). Dette er offline-simuleringer.

Testpakketittel: `GolfKongen_Booking_2_0_KLAR_FOR_TEST.zip`. Checksum SHA256:
`5ad0f2ea7667073f7e85d35da361353b3fcbc61d2259aa11f08bd4018d55bae4`.
Kildekodene til de nye simuleringsmodulene er i testpakken, ikke deployet og ikke overført til den opprinnelige frontend-koden. **Bruk disse eksisterende filene når implementeringen fortsetter; ikke skriv dem om fra bunnen av.**

## Bevarende produksjonsplan

- Design på kunde/admin: **bruk allerede godkjent stil**, ingen redesigntest trengs nå.
- Bevar eksisterende Quickbutik-varsling/Pushover. Nåværende utløserkilde (Make/Quickbutik/annet) er **ikke verifisert** fra frontendkode. Ikke slå av eksisterende oppsett.
- Før implementering: verifiser sikker checkout for ulike tidslengder, serververifiserte rabattkoder, pålitelig ordrestatus og Pushover-trigger i dagens system.
- Deretter bygg server-side 30-minutters-reservasjoner og Pushover event outbox i separat testmiljø. Bruk sikre transaksjoner og unik aktiv ressurskonfliktregel, ikke JS-in-memory som beskyttelse.
- Test med ekte, kontrollert ordre og ett Pushover-varsel. Test avbrutt betaling, doble varsler, refundering, eksisterende ordre og hele-lokalet-blokk. Først etter godkjenning publiser.
- Hvis de nødvendige integrasjonene ikke kan inspiseres eller virkelig testes, **stopp her** i stedet for å lage enda en kopi av UI eller uavhengig simulert motor.

## Referanser i denne grenen

- `booking-v2/README.md`: opprinnelig arkitektur.
- `booking-v2/NESTE_ARBEIDSOKT.md`: videreføring.
- `booking-v2/PUSHOVER_VIDEREFORING.md`: eksisterende varsling som lanseringskrav.

**Lanseringsstatus:** Ikke produksjonsklart. **Forberedelsesstatus:** Ingen flere store kodeendringer bør gjøres før integrasjonsverifisering.
