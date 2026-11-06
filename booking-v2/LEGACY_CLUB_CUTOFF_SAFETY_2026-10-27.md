# Booking 2.0 — sikring mot gammel klubbpåmelding (27.10.2026)

## Beslutning / sikkerhetsstatus
**IKKE KLAR FOR OFFENTLIG ÅPNING.** Gammel klubbkasse for Quickbutik produkt 1322 har ingen atomisk claim i gk2_private.claims. Fersk `qty=10` er bare et øyeblikksbilde og kan ikke garantere at en kunde ikke betaler klubbdeltakelse etter at en ordinær slot er reservert. Ikke sett `legacy_rules_verified` eller `legacy_cron_switch_verified` til true før faktisk cutover er verifisert.

## Trygg løsning (anbefalt: cutoff først)
1. Kartlegg eksisterende klubbprodukt 1322, datovarianter og alle eksisterende lenker / salgskanaler. Registrer eksakt nåværende salgsvindu og eksisterende ordre uten persondata i repo. Verifiser at ingen alternative lenker / direkte handlekurv-URL-er omgår en sperre.
2. Etabler serverhåndhevet absolutt frist for **gammel** klubbpåmelding: tirsdag kl 00:01 Europe/Oslo for etterfølgende torsdag. Frontend-skjuling er ikke nok. Etter fristen må Quickbutik-kassen ikke kunne gjennomføre kjøp av den torsdagsvarianten, inklusive en kurv startet før fristen. Planlegg også betalingsforsøk som fortsatt er i prosess ved fristen.
3. Før en torsdag kan frigis til dart/venue, må alle gamle betalte og ventende klubbkjøp være avklart og samlet kapasitet verifisert. `remaining=10` alene er ikke tilstrekkelig hvis eldre uavsluttede betalinger kan bekreftes senere. Alle 10 plassene ledige + gammel kasse definitivt lukket + ingen uavklarte betalinger er nødvendig.
4. Først etter eksplisitt verifisert cutoff og godkjent test av gamle ordre settes legacy-portene. Hvis cutoff ikke kan håndheves med støttet Quickbutik-funksjon, behold torsdag dart A/B/venue 19–22 sperret **også etter tirsdag**. Alternativt flytt klubbkjøp til samme atomiske hold/checkout som Booking 2.0.
5. Hold HYZR uavhengig, og behold vanlige ressursregler: venue overlapper med dart A/B og HYZR; ingen kollisjon på eksakt endepunkt kl 19:00.

## Testmatrise før frigivelse
- Mandag før frist: torsdag dart A/B/venue 19–22 sperret selv om 10/10 ledig.
- Tirsdag etter frist, 10/10, legacy checkout lukket og ingen uavklarte betalinger: kan frigis.
- Tirsdag etter frist, 9/10 eller færre: klubbprioritet fortsatt sperret.
- Gammel handlekurv opprettet før frist, checkout etter frist: betaling avvist.
- Betalingswebhook forsinket for klubb: ikke frigi mens utfallet er uavklart.
- Eldre snapshot, Quickbutik-feil/timeout, ukjent eller tvetydig variant: sperret.
- To samtidige klienter ved siste ledige slot: høyst én kan få aktiv claim og betalt bekreftelse.
- Sommer-/vintertid og årsskifte: frist beregnes i Europe/Oslo.
- Eksisterende paid/confirmed booking og ordinære V1-reservasjoner etter cutover: må være lagt inn som sperrer før åpning.

## Dagens bekreftede tekniske fakta
- `club-priority.mjs` leser produkt 1322 fra Quickbutik; `club_priority_blocked` slipper etter tirsdag 00:01 hvis ferskt snapshot `remaining=10`. Dette løser ikke separat legacy-kasse-race.
- `gk2_hold_slot` og `gk2_day_availability` har åtte release-gates, inkludert `legacy_rules_verified` og `legacy_cron_switch_verified`. De skal forbli false under verifikasjon.
- 113 tester er rapportert bestått i forrige økt. Ikke tell testene som proof for reelt simultant Quickbutik-kjøp.
- Ny checkout, webhook/notifier og offentlig booking aktiveres **ikke** ved denne dokumentasjonen.
- Ikke endre Min Bag-produksjon. Ikke legg Nuki-token, API-nøkler eller reservekode i GitHub.

## Neste verifiserbare gjennomføring
Les støtte for cutoff i gammel Quickbutik-kasse, følg kontrollert test med gammel vare i handlekurven over fristen, kontroller utestående betalinger og kjør staging-tester med en samtidig vanlig booking. Deretter **én** reell betalt testbooking med korrekt hold→ordre→webhook→bekreftelse→varsling→Nuki; fysisk kodeprøve og sletting når eier er ved døra. Loggfør bevis og først deretter vurder frigivelsesporter.
