# Booking 2.0 — fremdrift 26. oktober: ekte ordre-API kobles i staging

## Utført (IKKE bare planlagt)
- **Ekte Quickbutik/Vipps-kjøp ble allerede testet:** Quickbutik-ordre **3706**, HYZR 60min, ansattpris 15 kr, ekstra rabattkode 30%, faktisk betalt 10,50 kr. Etter testen ble ordren **voided/cancelled** og testprodukt **1477 skjult/variant stock0**. Dette verifiserer kassen, **ikke** en booket tid eller Pushover.
- Alle 33 varighetsprodukter **1474–1506** finnes og er skjult. **0/33** åpnet for salg. Ingen grunn til å opprette dem igjen eller ny betalt kassetest før den sikre bookingkoblingen fungerer.
- Supabase staging **eadgdcimcmfyuicizboo**, Edge Function **gk-booking-v2 v14** DEPLOYET. Eksisterende v13-filer og rutene beholdt bit-for-bit, med én import og ett nytt adminbeskyttet endepunkt.
- **Ny faktisk staging-funksjon**: `GET /admin/order-audit?order=3706`, autentisert Supabase admin-JWT samt allowlist. Leser read-only fra Quickbutik V1 GET `/v1/orders?order_id=3706&include_details=true&limit=2` med Basic auth og serverhemmeligheten `GK2_QUICKBUTIK_API_KEY`. Svaret er minimert, uten personopplysninger/hemmeligheter. Ukjent legacy status tolkes ALDRI som betalt booking. Ingen DB-skriving eller varsler.
- **Admin UI**: `https://msvendsen87.github.io/golfkongen-booking/` → `Kassekontroll` → `Verifiser Quickbutik-ordre (kun lesing)` har input og knapp. GitHub Pages-deploy ble verifisert grønn i Actions.
- 9 nye enhetstester for ordreleseren, alle bestått lokalt på Node 22. GitHub Workflow for betaling/Pushover har fått disse testene inkludert; siste Actions-run var **success**.
- Ingen endringer i Quickbutik-priser, Pushover, Min Bag, produksjons-booking eller Supabase release gates. Betalingsrutene `/hold`, `/checkout` og `/webhook/*` er fremdeles HTTP 503.

## Etterfølgende konkret menneskesteg
1. Eier åpner admin og logger inn. Under **Kassekontroll**, trykk **Kontroller automatikk og betalingsklarhet**. Les feltet `Quickbutik API-nøkkel på Supabase`.
2. Hvis **NEI**, legg eksisterende Quickbutik API-nøkkel inn i **Supabase staging-prosjektet** `golfkongen-minbag-staging` (ref `eadgdcimcmfyuicizboo`), under `Edge Functions → Secrets` med navn **GK2_QUICKBUTIK_API_KEY**. Ikke send nøkkelen i chat, aldri i GitHub-kode eller browser. En GitHub Actions Secret er en annen hemmelighetsbutikk. Offisielt: https://supabase.com/docs/guides/functions/secrets. Ingen redeploy trengs ved oppdatert secret.
3. Hvis **JA** eller etter at nøkkelen er satt: Under `Kassekontroll → Verifiser Quickbutik-ordre`, skriv **3706** og trykk `Les ordrestatus`. Send bare **status/feilkode** eller skjermbilde **uten hemmeligheter**. Dette er read-only og krever ingen betaling.
4. Hvis et feilresultat oppstår: Sjekk om Quickbutik V1-tjenesten faktisk returnerer forventet statusstruktur, API-rettigheter og serverlogg. Ikke anta at legacy `status=1/2` betyr betalt – bruk Quickbutiks autoritative statusinformasjon og den allerede vellykkede MCP-normaliserte ordrevisningen ved utvikling.

## Neste tekniske milepæl — IKKE test ansattpris på nytt
- Implementer den identitets-/prisverifiserte `hold → én tidsvariant i Quickbutik handlekurv → order.new → serververifisert betalt ordre → gk2_confirm_paid_slot → notification_outbox → eksisterende Pushover`-kjeden i staging.
- Sikre korrekt kobling booking UUID ↔ ordre-ID, utløp av hold, annullerte/refunderte og forsinkede ordre, gavekort/rabattkode, klubb-/ansattpriser, pilsett á 25 kr, eksplisitt vilkårsgodkjenning, 45-dagers rullering og allerede betalte eldre bookinger.
- Test én kontrollert ekte booking **først når** kasse/hold/webhook faktisk er klar. Ikke aktiver 33 produkter eller fjern release gates basert på bare kassetesten.
- Produksjonsendring krever godkjent cutover, verifisert dobbeltbooking-sikkerhet, korrekt Pushover og rollback.

**Status:** Staging ordre-API-adapter og admin UI deployet; ekte ordreoppslag via V1 fra staging avventer kontroll av serverhemmelighet og første autoriserte request. Hele bookingsystemet er fortsatt IKKE produksjonsklart.
