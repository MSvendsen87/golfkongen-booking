# Booking 2.0 – trygg pris- og rabattadministrasjon (28.10.2026)

## Gjennomført
- **Prisutkast er isolert fra aktiv kasse**: Private `gk2_private.price_change_drafts`, RPC `gk2_admin_save_price_draft`, `gk2_admin_price_drafts_list`, `gk2_admin_delete_price_draft`. Sikkerhet: SECURITY INVOKER, service_role-only, administrator-e-post + Supabase Auth/JWT på Edge.
- Edge `gk-booking-v2` v57 endret både `/admin/price-draft` og eldre `/admin/price-save` til bare å skrive til utkast. **Ingen skriver til `price_policies` via disse rutene nå.**
- Ny eierbeskyttet `/admin/price-drafts` og `/admin/price-draft-delete`.
- GitHub Pages `docs/booking/admin/index.html` importerer nå separat `docs/booking/admin/price-controls.mjs`: prisavstemming, kontrolliste på 121 spesialpriser, filtre etter gruppe/aktivitet/status, kopi av produktnummer/pris, og sletting av utkast.
- Ordinærpris kontrolleres read-only fra `/admin/price-sync-check`. Gruppepris kan verken leses eller skrives med dokumentert Quickbutik-API i denne tilkoblingen.
- Edge `gk-booking-v2` v58: `POST /admin/member-verify` krever JWT, admin-allowlist og `confirmQuickbutik:true`. RPC `gk2_admin_confirm_membership_quickbutik` markerer **kun manuell kontroll**, utfører INGEN Quickbutik-oppdatering. Beskyttet i databasen, journalføres.
- `gk2_admin_request_membership` støtter nå både `betalt_medlem` og `frisbee_dart`. Adminskjema benytter riktig kode for disse.
- Sportskongen Admin knappen er fortsatt pinned til riktig Booking 2.0-admin via den eksisterende loaderen.

## Verifisert
- 121 særprisrader i `group_price_entry_status` = `entered_reported`. 0 er dokumentert bekreftet via faktisk betalt Quickbutik-kasse.
- Null vedvarende testutkast, null vedvarende test-medlem, null nye ordinære prisendringer.
- Syntetiske SQL-transaksjoner med ROLLBACK bekreftet at utkast ikke endrer aktiv HYZR 60-minutterspris (150 kr).
- Syntetisk gruppetilknytning + verifisering i samme transaksjon med ROLLBACK bestått.
- Anon/authenticated har ikke EXECUTE på verifiserings-RPC eller prisutkast-RPC; service_role har. Edge har eget autentisert, verifisert admin-allowlist-gjerde.
- GitHub Pages deployment var vellykket på siste front-end-commit. Reell innlogget funksjonstest gjenstår.

## Gjenstår
1. **Ikke skriv ekte Quickbutik gruppepriser fra egen frontend** før en offisiell, autentisert og testet integrasjon faktisk finnes.
2. Manuell kundegruppetildeling i Quickbutik kreves fortsatt. Bekreft-knappen i admin markerer kun dokumentert manuell gjennomføring.
3. Verifiser faktisk kundekasse med representative grupper (ansatte, betalende medlemmer, ordinær) etter avtale med eier.
4. For ordinærpriser på tidsvarianter kreves en trygg synk for både moderprodukt og samtlige varianter uten å åpne lager/salg eller kollidere med betaling. Dette er ennå ikke implementert.
5. Ingen eksisterende ordrenummer, rabatter, varianter, kalender eller Nuki-koder endret under arbeidet.

## Kildeveiledninger
- https://quickbutik.com/no/hjelp/hvordan-tilpasser-jeg-priser-for-en-kundegruppe
- https://quickbutik.com/no/hjelp/hvordan-oppretter-jeg-kundegrupper
