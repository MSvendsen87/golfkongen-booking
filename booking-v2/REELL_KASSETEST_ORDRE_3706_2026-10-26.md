# Booking 2.0 – faktisk Quickbutik/Vipps kassetest 26.10.2026

**Status: vellykket betaling, IKKE reservasjon.** Bruker gjennomførte én autorisert ekte betaling, ordre 3706. Kilde: eierens skjermbilder + read-only `Quickbutik.get_order(ord_3706)`, verifisert 26.10.

## Kassefunn
- Quickbutik ordre `ord_3706`, `paymentStatus=paid`, `paidAt=2026-10-26T00:45:50Z`, `fulfillmentStatus=unfulfilled`.
- Produkt 1477: `Booking 2.0 – HYZR 1 time – TESTKJØP (ingen reservasjon)`; varen er **kun kassetest**; `SKU=GK2-TEST-ONLY-20261026-1H`.
- Valgt produktvariant: 2026-11-01 kl. 10:00–11:00, variant 282442. Ingen faktisk tidsreservasjon eller hold ble opprettet; ikke importer denne ordren som vanlig booking.
- Quickbutik viser varen som 15,00 kr i den innloggede brukerens kontekst (Ansatte), og `lineItems[0].unitPrice=1500` øre i ekte ordre. **Inneliggende ansattpris på 15 kr er dermed endelig verifisert i ekte Quickbutik-kasse**, ikke bare serverforhåndsvisningen. Vær oppmerksom på at Quickbutik-produktets ordinære basispris fortsatt er 150 kr.
- Kassen viser `Rabattkode aktiv` (eierens skjermbilde), fratrekk **4,50 kr (30 %)**, faktisk beløp **10,50 kr** betalt med Vipps, frakt `Hent i butikk` 0 kr.
- Ordredata: `amounts: {total: 1500, discount: 450, shipping:0, paid: 1050, tax:0}`, `discountId=null`. **Den konkrete rabattkoden er ikke oppgitt i ordredetaljene; ikke gjett navnet eller kilden ut over at kassen viser aktiv kode.**
- På første kassevisning var standardfrakt 45 kr, men brukeren valgte hent i butikk 0 kr før betaling.
- Retur etter betaling gikk til **vanlig «Takk for din bestilling»**, ikke bookingens egen takk-side `/sider/takk-for-reservasjonen`.
- Produkt 1477 står fortsatt `visible=true` ifølge Quickbutik, men testvarianten har `stock=0` etter betaling. Anbefalt å deaktivere/skjule separat etter godkjent test slik at ingen finner testproduktet i butikk; ikke gjør andre pris- eller lagerendringer automatisk.
- Produkt 1477 har `taxRate=0`, og e-postbekreftelsen viser «Hvorav mva: 0,00 kr». Verifiser korrekt skattemessig klassifisering og produkt-MVA før produksjon. Dette notatet gjør ingen juridisk konklusjon.
- **Ingen forventet Pushover-varsling og ingen ekte kalenderbekreftelse** for ren «TESTKJØP (ingen reservasjon)». Pushover og booking må testes separat gjennom autorisert gk2-hold→betaling→verified order→confirmation→outbox, ikke anta at én kjøpt testvare validerer hele kjeden.

## Konklusjon
- ✅ Quickbutik innlogging/ansatt-spesialpris 15 kr på produkt 1477; faktisk Vipps-betaling 10,50 kr; betalt ordre og bekreftelses-e-post fungerer.
- ⚠️ Ekstra aktiv rabattkode (30 %), betydning for framtidige kundegruppepris-regler må avgjøres. **Aldri bruk 15 kr som forventet betalt beløp hvis gyldig rabattkode gir 10,50 kr.**
- ⚠️ Fraktmetode, mva og generisk retur-/takk-side må tilpasses digital bookingflyt før lansering.
- 🔒 Ingen ny betaling nødvendig for å dokumentere dette. **0 av 33** ordinære Booking2-varighetsprodukter er fortsatt klare/aktivert ifølge siste admin-skjermbilde; testvaren 1477 var gjort midlertidig kjøpbar. Ikke aktiver resterende varer før ekte hold og betalt webhook er klar.
- ⛔ Dette er ikke en verifisert ende-til-ende booking. Testen skal ikke telle som godkjenning av konfliktlås, avtaleaksept, pilsett, 45-dagers rullering, Pushover eller adminbekreftelse.

## Neste utviklingssteg uten dobbeltarbeid
1. Behold den lagrede løsningen for `gk2_private` og eksisterende 33 produkter. Koble valgt varighetsprodukt med **en** konkret tidsvariant og én atomisk hold/booking-ID i isolert staging.
2. Implementer autorisert Quickbutik-kassestart, avstemmingsrutine mot faktisk betalt ordresum (gruppepris + eventuell faktisk rabattsum), og idempotent `order.new`-webhook/RPC. Sjekk aktiv hold før endelig bekreftelse.
3. Tilpass Pushover til ett varsel **per bekreftet booking** og unngå meldinger for kassetester. Bekreft riktig kalenderstatus og betalt orden.
4. Bookingkasse: velg «Ingen frakt – digital booking» eller dokumentert tjenesteshipping; bookingtilpasset takk-side; korrekt MVA; valgfri pilsett à 25 kr og vilkårsbekreftelse.
5. Test samtidig en kasse med **ingen ekstra rabattkode** via å fjerne den aktive koden i handlekurven; kun nødvendig å gå frem til ordresammendrag – **ikke et nytt betalt kjøp** før stagingkoblingen er klar.
