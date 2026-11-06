# Booking 2.0 – staging v37 og admin klubbtilgang (27.10.2026)

## Utført
- Opprettet `public.gk2_club_day_status(date)`, service_role-only, viser aggregert 10-plass-kapasitet, ledige plasser og blokkering dersom dart er reservert. Ingen medlems-ID-er eller personinformasjon.
- `gk-booking-v2` deployet v37 med `GET /club/availability?date=YYYY-MM-DD` for torsdager, med `checkoutEnabled:false` og fail-closed ved ugyldig dato. Deployet kode og versjon lest tilbake som ACTIVE.
- SQL-transaksjonstest med ROLLBACK: tom torsdag = 10 ledige, 3 klubbhold = 7 ledige, dart_a-hold = 0 tilgjengelig / reason dart_reserved. Ingen testdata beholdt.
- Eiers admin `docs/index.html` har nå klubbtilgang under «Medlemmer og fordeler», med oppdater oversikt, legg til, deaktiver/aktiver og status-/feilmeldinger. Kaller eksisterende owner-JWT-beskyttede GET/POST `/admin/club-access`. Bruker kun DOM textContent for serverdata. GitHub commit `1b5682728b922777eebcf1be0dd9221e0a794f7d`; ikke hevdet som nettleserverifisert.
- Readback staging: 0 club_enrolments, 0 club_access_stage, 0 audit, legacy_rules_verified=false og legacy_cron_switch_verified=false. Ingen åpning av release gates. Min Bag produksjon urørt.

## Kritisk gjenstående før kjøp eller lansering
1. Autorisert kundeidentitet og klientvalg for klubbkveld i kundekalender. Ikke godta vilkårlig kunde-ID fra klient.
2. Klubbspesifikk Quickbutik-betalingslinje 50 NOK/sete, betrodd hold-til-ordre-bind, webhook-verifisert bekreftelse og idempotent cancellation/recovery; plasser må holdes så lenge kunde er i aktiv betalt checkout, uten falske utløp.
3. Varsler og Nuki fra klubbordre må kobles til riktig deltakers tilgang, uten kode før verifisert betalt/confirmed.
4. Admin UI må testes innlogget av eier, og medlemsidentiteter må matches mot betrodd kunde-ID (ikke navn/e-post som eneste autentisering).
5. Ekte kjøpstest av øvrige Booking 2.0-aktiviteter, eksisterende gamle betalte reservasjoner, cutover fra alle gamle kjøpsveier og fysisk Nuki-test.
6. Ingen offentlige betalingsporter aktivert; dette er staging-utvikling og rollback-DB-tester, ikke bevis for full ekstern E2E.
