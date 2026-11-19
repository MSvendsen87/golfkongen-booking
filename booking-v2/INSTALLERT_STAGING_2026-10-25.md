# GolfKongen Booking 2.0 – FAKTISK installert i Supabase (25.10.2026)

## Database og isolasjon

- **Supabase-prosjekt**: eksisterende betalt `golfkongen-minbag-staging`, ref `eadgdcimcmfyuicizboo`.
- Nytt skjema: **`gk2_private`**, 13 **nye** bookingtabeller, ingen eksisterende tabeller flyttet/renamed/oppdatert.
- Alle 13 nye tabeller har RLS aktivert og ingen direkte `anon` eller `authenticated`-tabellrettigheter.
- Eksisterende `public.minbag_*`: **51 tabeller før og etter** (kun lest; ingen Min Bag-DML/DDL utført).
- 11 nye, unik-prefiksede service-role-only RPC-er: `public.gk2_*`. De er ikke kjørbare av `anon`.
- Følgende Supabase-migreringer er faktisk kjørt og registrert i prosjekthistorikken:
  - `20261025161214 booking2_private_isolated_initial`
  - `20261025161335 booking2_core_rpc_fail_closed`
  - `20261025161456 booking2_admin_calendar_and_drafts`
- `gk2_private.release_gates`: **8 sjekkpunkter fortsatt FALSE**, og serverbasert hold kan ikke brukes før alle er verifisert.
- Admin-e-postliste: KUN `post@golfkongen.no` og `kristoffer.mrk@gmail.com`. Prosjektet har **0** Supabase Auth-brukere med disse e-postadressene nå. Innlogging krever at disse opprettes/inviteres via Authentication > Users; ikke bygg admin ved å stole på klientens oppgitte e-post.

## Faktisk API-deploy
- Edge Function: **`gk-booking-v2`**, versjon **2**, status `ACTIVE` i staging-prosjektet. Offentlig URL: `https://eadgdcimcmfyuicizboo.supabase.co/functions/v1/gk-booking-v2`.
- Kildekode i DENNE GitHub-grenen: `booking-v2/supabase/functions/gk-booking-v2/index.ts`.
- `GET /health` og `GET /availability?date=YYYY-MM-DD` er lesende.
- `POST /admin/*` krever validering av faktisk Supabase Auth-token og én av de to allowlist-e-postene. Admin kan konfigurere ressursvise åpningstider, sperringer/oppheving, prisUTKAST, medlemsendringsFORESPØRSLER og turneringsUTKAST.
- `/hold`, `/checkout` og `/webhook/*` returnerer **503**, med vilje. Ingen ekstern betaling/varsling er aktivert på det nye API-et.
- `verify_jwt=false` er satt på selve Edge-gatewayen for å tillate offentlig GET av tilgjengelighet; admin-ruter validerer signerte bruker-JWT mot Supabase Auth server-side. De må forbli påslått og sikkerhetstestes før live.
- Offentlig tilgjengelighetsrespons er sanert: den gir **ikke** interne stengeregler, kommentarer eller bookingordre/kundedata.

## Innlagte regler og historikk (booking 2.0-kopi, ikke endringer i original)
- Innlagt 4 aktiviteter × 7 ukedager = **28 resource-specific åpningstidsposter** med tidligere standard **10:00–22:00**, redigerbare i admin.
- Innlagt 3 kjente, aktive regler (disse er **ikke** fullført live-synk): butikkåpent lørdag 10–16 stenger bare muligheten for hele-lokalet; 24.–25. desember stengt; nye bestillinger blokkert 25.–31. oktober.
- Quickbutik ordren **3662** bekreftet betalt og ikke refundert, 31.10.2026 18:00–22:00, 4t hele lokalet: kopiert til `reservations` som `confirmed`, med **24 unike 30-minuttersressurskrav** i `claims`. Betalt 16 kr etter gyldig rabatt; gammel ordre er urørt.
- Admin-RPC-ene testet innen en **ROLLBACK-transaksjon**: begge e-poster godkjent; ukjent avvist; åpningstid, blokker/opphev, prisutkast, medlemsendring, turneringsutkast og snapshot; forsøk på kunde-hold avvist med `gk2_launch_locked`. Ingen testordre/testmedlem ligger igjen.

## Forhåndsvisninger (samtalens filer)
- `booking2_admin_KLAR_FOR_INNLOGGING.html`: kundevisuelt design som tidligere, med korrekt API, prosjektets trygge public/publishable key, og oppdatert ressursspesifikk åpningstidsadministrasjon. Skal bare legges på GolfKongen-domene etter sikker test, ikke eksponeres som en ukontrollert administrasjons-API.
- `booking2_kundeside_TEST_INGEN_BETALING.html`: samme HYZR/DartCounter-bilder og vilkår som avtalt, leser nye tilgjengelighetsdata, men ingen kjøpsknapp virker før checkout er godkjent.
- **Bildeopplysninger:** user-supplied Google thumbnail URLs er midlertidige og bør skiftes ut med egne bilder før/etter åpning.

## Vesentlige stoppere før offentlig booking 1. november
1. Ingen faktisk Supabase Auth-bruker for de to adminkontoene. Opprett dem i **riktig prosjekt** først.
2. Gammel Supabase-prod `golfkongen-booking-admin` ikke tilgjengelig gjennom tilkoblingen nå; alle fremtidige Quickbutik-bookinger og gjeldende sperringer er **ikke fullstendig migrert**. Klubbkveld torsdag trenger betinget lås/frigivelse.
3. Quickbutik bekreftet checkout for 30/60/90/120+ minutter, pris per simulator, alle 7 kundegrupper, rabattkoder/gavekort er **ikke utviklet/testet end-to-end**. Prisene må aldri gjettes eller beregnes bare fra frontend.
4. Pushover fra eksisterende Make -> Cloudflare Worker må gjenbrukes/erstattes kontrollert, ett push per betalt booking, aldri per halvtime. Eksisterende token skal roteres siden delt tidligere.
5. Ekte simultan bookinglast og Quickbutik-webhook-deduplisering må verifiseres med flere klienter. Gjennomført rollback-test av admin er ikke en produksjonscheckout-test.
6. Ingen automatisk publisering av Quickbutik-sidene er mulig med nåværende kobling. **Gammel produksjonsbooking, Min Bag og Pushover er urørt.**
7. Kontroller at 1. november måloppstart skjer **bare når alle åtte gatefelter er verifisert**.

## Arbeidsinstruks til neste gang
Bruk prosjektet som allerede er opprettet. **Ikke lag ny Supabase-organisasjon/prosjekt, ikke kjør migreringene på nytt, ikke skriv om allerede implementerte RPC-er eller frontend fra scratch.** Fortsett med reell Quickbutik-kasseintegrasjon, alle gyldige gamle bookinger, og innlogging. La Min Bag være helt urørt.
