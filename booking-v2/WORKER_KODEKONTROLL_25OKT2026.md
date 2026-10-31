# Kontroll av eksisterende gk-booking-admin — 25.10.2026

**Kun kildekodegjennomgang og isolert patch. Ingen endring av live Cloudflare Worker, Supabase, Quickbutik eller Pushover.**

## Kontrollert i den brukerleverte Cloudflare-koden (1941 linjer)
- Vedlikeholder 40 dager med 60-minutters-slot for HYZR/dart, 4–12 timer for lokale (timestrinn), og standard åpningstid 10–22.
- Leser `gk_booking_rules` i Supabase; `/booking/closed-times` er offentlig, øvrige `/booking/*` krever admin token sendt som URL-query.
- `scheduled()` kjører `maintain40DaysPlan(... apply:true)` som kan sende `variants.sync` for Quickbutik-produkter (1316/1317/1320/1349).
- `syncMissingVariants(...apply:true)` mangler aktuell Supabase-regelkontroll.
- `maintain40DaysPlan` fortsetter med reserveverdier hvis Supabase-regler ikke kan lastes; disse er tomme ved kald start. Risiko: manglende, egentlig stengte tider kan opprettes.
- Workerens prisberegning for leie av hele lokalet overstyrer særprisene med `durationHours*pricePerHour`. Dette krever gjennomgang før adminprisregel på lokale åpnes.
- Workerens admin-token i URL er IKKE samme som tofaktor-/kontobasert tilgang for bare `post@golfkongen.no` og `kristoffer.mrk@gmail.com`; Booking 2.0 krever et separat autentisert API.
- Filen inneholder ikke Pushover-/ordrewebhooklogikken. Denne må lokaliseres i øvrige Workers/Make/Quickbutik uten å avbryte eksisterende varsler.

## Isolert sikkerhetspatch
Opprettet lokal patch, full testkopi og 8 tester. Ved feil i Supabase returnerer maintain 503 **uten ett Quickbutik-kall**. Direkte sync-missing apply returnerer 409 fremfor å omgå reglene. Auth-test og plan-only med frisk database ble også bestått. **8/8 offline-tester bestått**; ikke produksjonstestet.

Patch: `booking-v2/patches/gk-booking-admin-failclosed.patch`. Den er **ikke publisert** og løser ikke de nye slottene, betalingen, Pushover eller medlemsadministrasjon.

## Sikker vei videre
1. Kartlegg hvor `cold-shadow-36dc` / ordrewebhook / Pushover ligger og hvilke Cloudflare Cron-triggere som kjører.
2. Kopier til ny staging-Worker, test lese- og feilscenario med ekte Supabase, men uten Quickbutik-write.
3. Test Quickbutik checkout med betalt og annullert ordre samt alle kundegrupper/rabatter i isolert miljø.
4. Implementer atomisk 30-minutters ressursallokering, bekreftelse etter betalt ordre og Pushover-outbox. Adminserver: kun to autoriserte e-postkontoer, sikre sesjoner, aldri token i URL.
5. Bytt /aktiviteter HTML og bookingkobling først etter validering; offentlig side skal bare ha kundetekst, HYZR åpner snart, DartCounter og innesko/sokker.

**Ikke lim patchen over dagens produksjons-Worker direkte.**
