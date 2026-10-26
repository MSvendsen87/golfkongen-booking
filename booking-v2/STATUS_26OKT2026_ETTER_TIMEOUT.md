# Booking 2.0 – videreføring etter timeout, 26. oktober 2026

## Viktig: IKKE lansert
- Alle 33 egne Booking2 Quickbutik-produkter er skjulte; varianter skal ha `stock=0`, `hidden=true`.
- Supabase `gk-booking-v2` Edge nå v27; `GK2_CHECKOUT_ENABLED` og `GK2_WEBHOOK_ENABLED` fortsatt av, 8 release-gates false, ingen nye publiserte produktplaner.
- Original staging-reservasjon er bevart, ingen utsendelser eller nye kunder påvirket.
- Gamle bookinger på golfkongen.no må fungere inntil kontrollert overtakelse.

## Etter suksess med gammel Quickbutik V1-metode
- `variants.add` for dato/SKU/qty0 og egen V1 `variant_id,visible:0,stock:0` for skjuling, begge testet med reelt produkt.
- Kontrollert Quickbutik staging-synk: 33 varianter, deretter 330, 1308 og 4746 nye, alle disse kjøringene grønne i GitHub. Ny 5000-budgettrullering, run 40407642296, startet; ikke anta suksess før run er ferdig.
- GitHub main-workflow `gk2-rolling-variants.yml` kjører rullerende 45-dagers prewarm, all styling og lager alltid skjult/0.

## Checkout/server
- Quickbutik er pris- og rabattfasit. Verified paid status + ordrenummer + kunde + korrekt produkt/variant/SKU + antall, refusjoner/frakt valideres i Edge. Ingen uriktig `total_amount` brukt som faktisk betalt.
- `gk2_prepare_cart_intent`, `gk2_match_paid_order_to_hold`, `gk2_confirm_paid_order_status`: implementert og tested via SQL BEGIN/ROLLBACK.
- `/hold` staged behind release gates: atomisk DB hold, bind vilkår/e-post, legg varianter i Quickbutik-kassen; pris settes av Quickbutik. Kunde-UI i `docs/booking/index.html` men `checkoutVerified=false` og backend sperret inntil lansering.
- Viktig fortsatt ikke realtestet Quickbutik `/cart/add` på golfkongen.no; HTTP 200 alene beviser ikke at varen ligger i handlekurven.

## Sikker utløping installert 26. oktober
- Migrasjon 019 og 020 **anvendt** via Supabase `apply_migration`, ikke via vanlig DDL-spørring.
- `gk2_private.checkout_variant_leases` styrer åpning/låsing av Quickbutik-variant med `opening/open/closing/closed/relock_failed`.
- `gk2_hold_slot` skal IKKE slippe et utløpt kalenderkrav mens Quickbutik-varianten fortsatt er åpen; `gk2_abort_precheckout_hold` har samme sperre. SQL test i BEGIN/ROLLBACK bestod: aktiv lease hindret release, vanlig hold kunne slippes, lease ble frigitt først etter bekreftet tilbake­låsing.
- Edge v27 inneholder `/internal/relock-expired` med tidsavgrenset HMAC, ingen rå Quickbutik-hemmelighet sendes.
- GitHub-main `.github/workflows/gk2-expired-cart-recovery.yml`: hvert 10. minutt **bare når repo variabel `GK2_CUSTOMER_CHECKOUT_LIVE=true`**. Ingen løpende runner-kost før launch. Engangstest run 40408350578 står i kø bak variantjobben pga delt concurrency-lås. Test må bli grønn før lansering.

## Fremdeles blokkerende
1. Bekreft GitHub cleanup-run 40408350578 og den nye prewarm run 40407642296. Ved feil stopp, aldri slå på live.
2. Komplett 45-dagers Quickbutik variantdekning for 33 produkter. Ikke anta at en grønn enkeltjobb gir full dekning.
3. Quickbutik real cart/checkout test på golfkongen.no (eierinnlogging), korrekt kundegruppepris og 25 kr per pilsett, tydelig bookingvilkår.
4. Betalt Quickbutik webhook live handshake, korrekt ordrematching/duplicate/expired/refund, samt trygt deaktivering av gamle systemer.
5. Utsending fra `notification_outbox`: booking/Pushover og Nuki kode/e-post fra BEKREFTET reservasjon; unngå separat Nuki-worker som lytter direkte på betalt ordre. Fysisk Keypad-test før adgangskoder sendes.
6. Avbestilling/refusjon og kode-revokering, legacy bookinger, mobil og sammenfallende bookinger/resterende release-gates.
7. Endelig publisering på golfkongen.no etter alle testene, ikke tidligere. For å starte automatisk opprydding ved lansering må GitHub repository variable `GK2_CUSTOMER_CHECKOUT_LIVE=true` settes kontrollert.

## Eiers handling nå
Ingen Quickbutik-pris eller API-nøkkel trenger legges inn på nytt. Ikke åpne skjulte bookingprodukter eller Nuki-automatikken. Fysisk Nuki Keypad kan fortsatt testes i den andre chatten.
