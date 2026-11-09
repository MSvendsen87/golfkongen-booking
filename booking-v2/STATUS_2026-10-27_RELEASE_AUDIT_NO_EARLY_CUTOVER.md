# GolfKongen Booking 2.0 – Release audit 27. oktober 2026 (før fysisk Nuki-test)

## Mål
Eier ønsker åpning raskt og aksepterer midlertidig manuell kodelevering dersom Nuki skulle feile. Men ingen betalt ordre skal aksepteres uten verifisert kjøp->hold->bekreftelse og ingen dobbeltbooking.

## Dokumentert i denne arbeidsøkten
- Pushover-gruppe «Golfkongen» verifisert via API og reell varselmottakelse bekreftet av eier.
- Resend test fra booking@golfkongen.no til eier med status delivered.
- Nuki 22722489119, Keypad og auth GET kontrollert; fysisk åpne-/slettekode-test ikke utført. Ikke opprett kode mens ingen er ved døren.
- Supabase `gk2_private.checkout_product_plans`: 33 registrerte, 0 is_ready, 0 publish_enabled. Alle åtte `release_gates` står false. 1 eksisterende reservasjon; ingen nye kundeordre/outbox/codes.
- 121 gruppepriser er registrert med stage `entered_reported`; 0 `verified_at`. Ingen priser skal legges inn på nytt. Kun riktige representativt kontrollerte kasser skal godkjennes.
- Read-only automatisk V1 SKU audit (run [40484973940](https://github.com/MSvendsen87/golfkongen-booking/actions/runs/40484973940)): 41 bookbare datoer 1. november–11. desember, 33 produkter, 23 493 forventede (10–22, 30 min intervaller), 15 118 til stede, **8 375 mangler** = 64.35 % dekning. Seks av 33 komplette. Ingen duplikater, usikre lager/status blant de eksisterende SKUene.
- Etter audit utløst ny skjult stock-0 sync med maks 5 000, GitHub run [40485159879](https://github.com/MSvendsen87/golfkongen-booking/actions/runs/40485159879). **Ikke oppgi som fullført før konklusjon er lest**. Før en ny kjøring, bekreft at den forrige er success. Kjør ny read-only audit etterpå.
- SQL transaksjonstest med ALL release_gates midlertidig satt true kun i BEGIN...ROLLBACK, `gk2_hold_slot` for dart A og B samtidig, venue blokkert begge retninger, 28 atomiske claims korrekt; ingen testbooking eller opphevede gates ble stående. Dette tester regler, ikke ekte to samtidige checkout-klienter.
- Booking2 forhåndsvisningens avbestillingstekst rettet fra 20 min til faktiske publiserte vilkår: dart/simulator 30 minutter, hele lokalet 24 timer.
- Lesing av eldre Quickbutik-produkt 1316,1317,1320,1349: disse er VISIBLE i gammel aktiv løsning; dart tillatt før 1 Nov, HYZR 0 kjøpbare før 1 Nov, venue hadde **3 feilaktige kjøpbare SKUer 31 Okt**. Disse tre ble satt `stock=0`,`hidden=true`: variant 279655,279657,279658. Etterkontroll: 0 kjøpbare for venue før 1 Nov, HYZR 0, dart A/B 56 hver fra 27–31 Okt. Ikke berørt eksisterende ordre.
- Ekte Quickbutik Vipps-kassetest ordre 3706 dokumenterte enkelte pris-/fraktforhold, men ble annullert og var aldri koblet til bekreftet Booking2 kalender. Ikke tell som ende-til-ende.
- `docs/booking/index.html` preview på GitHub Pages er klar i STAGING med `checkoutVerified:false`; det er ikke publisert som aktiv Quickbutik kasse på golfkongen.no.

## Konkrete fortsatt usikre/ikke verifiserte forhold før Booking2 produksjon
1. 8 375 manglende tidsvarianter må opprettes og readback-kontrolleres; dokumenter at alle 33 produkter/dager har riktig SKU+pris+lager, at nightly sync ikke lager dubletter.
2. Quickbutik-handlekurv `/cart/add` for eksakt hidden-parent variant samt pilsett produkt 1318 må observeres i ekte butikk før betalingsknapp aktiveres. HTTP 200 alene er ikke garanti for at varen ble lagt i kassa.
3. End-to-end test for atomisk hold -> Quickbutik gruppepris (rabattkode/ingen rabattkode), ingen frakt for booking, riktig MVA, faktisk betalt `order.new` webhook -> bekreftet booking/outbox. Ikke gjenta 3706 som om den bekrefter dette.
4. Verifiser at eksisterende bookingordre/bindende reservasjoner og vedlikeholdsjobber ikke kolliderer med ny kalender; overfør/sperr riktig ved kontrollert cutover.
5. Automatisk Nuki/Resend/Pushover fra én **reell** bekreftet booking og varsling ved feil; fysisk Keypad-test og tilbakekalling må gjennomføres før gjester skal benytte systemet.
6. Release gates godkjennes kun etter hvert med bevis; behold GAMMEL løsning åpen i mellomtiden. IKKE aktiver `GK2_CHECKOUT_ENABLED`,`GK2_WEBHOOK_ENABLED`,`GK2_NOTIFIER_ENABLED` eller GitHub `GK2_CUSTOMER_CHECKOUT_LIVE` nå.

## Midlertidig operasjon mens Nuki fysisk test venter
- Det finnes offentlig side `https://golfkongen.no/aktiviteter`, lenker til den gamle bookingløsningen; gamle dartprodukter er synlige. Hvis betalende kunde bruker GAMMEL løsning, må adgangsopplysninger leveres manuelt via eksisterende prosedyre – ikke anta at Booking2 automatisk har sendt kode.
- Eier kan fysisk teste Nuki senere; første bookbare dato for HYZR og hele lokalet er 1. november.
- Ikke påstå at nettstedet er «nytt komplett Booking 2.0 live» nå.
