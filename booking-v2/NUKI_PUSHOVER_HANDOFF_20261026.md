# GolfKongen Booking 2.0 – Nuki / Pushover / Resend overlevering 26.10.2026

**Lås-ID:** 22722489119 (Nuki Web, fra eier). Nuki Keypad rettigheter: `smartlock.readonly` + `smartlock.auth`. Tokenverdi er ALDRI lagret i GitHub eller chat.

## Utført
- Supabase private migrasjoner 021/022/023 installert: outbox, kryptert Nuki-code state, service-only RPC, idempotens, cooldown og kansellering før frigjøring av slot.
- SQL tests med `BEGIN ... ROLLBACK`: queue Pushover + Nuki, én kode per booking, rett lockId, status overganger, ingen dobbel utsendelse på immediate retry; verified cancellation holder kalender-claims til Nuki-kode er revoked.
- Eksisterende Booking2 Edge `gk-booking-v2` **v28**: verifierer `order.new` + `order.cancelled` fra Quickbutik med webhook security hash og API readback, krever alle release-gates samt explicit kill switch.
- Ny `gk-booking-notifier` **v3** i Supabase: kodet direkte Pushover, Nuki Web API auth type 13, Nuki readback + tidsgrenser, AES-GCM encrypted PIN, separat Resend e-post, uthenting fra database outbox, kansellering og API revokering. `GK2_NOTIFIER_ENABLED=false` by default.
- Nuki 5 min før til slutt, Europe/Oslo UTC DST-check, unik seks-sifret kode. Ingen kode sendes før matchende Nuki authorisation GET. Fysisk Keypad-synk kan fortsatt feile -> fysisk test kreves.
- GitHub Actions `.github/workflows/gk2-confirmed-booking-notifications.yml`: signert intern cron hvert 5. min, **kun om repo var `GK2_CUSTOMER_CHECKOUT_LIVE=true`**, ellers ingen idle runner-kost.
- Testene er grønne (se run https://github.com/MSvendsen87/golfkongen-booking/actions/runs/40411373364).
- Resend `golfkongen.no` domain verified, sending enabled i EU-west.
- De gamle Quickbutik-produktene/Cloudflare-Pushover-Worker er URØRT. Den separate Nuki grenens `ACTIVE` MÅ IKKE settes til true eller lytte på Quickbutik direkte.
- Verifisert live Edge health: booking2 checkout false; notifier enabled false + configured false. Ingen Nuki access-koder, outbox-notifikasjoner eller nye aktive bookingprodukter.

## ÉN nødvendig sikker operasjon fra eier før realtest
Nuki-token og Pushover/Resend nøkler er ikke tilgjengelige i Supabase, og installert Supabase connector støtter ikke å skrive Secrets uten eier UI. Gå til Supabase-prosjekt `eadgdcimcmfyuicizboo` > Edge Functions > Secrets, legg inn nøyaktig:
- `NUKI_API_TOKEN`: token opprettet i Nuki Web (husk Save).
- `NUKI_LOCK_ID`: `22722489119`
- `GK2_PUSHOVER_APP_TOKEN`: eksisterende Pushover application token.
- `GK2_PUSHOVER_USER_KEY`: mottakerens Pushover user key.
- `RESEND_API_KEY`: ny send-only key fra Resend for golfkongen.no. Ikke gjenbruk Supabase Auth nøkkel.
- `GK2_CODE_KEY_BASE64`: generer 32 CSPRNG byte, base64, ta sikker backup: PowerShell:
  ```powershell
  $b=New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  [Convert]::ToBase64String($b)
  ```
- `GK2_NOTIFIER_ENABLED`: `true` først ETTER alle verdier er lagret. Eksisterende `GK2_QUICKBUTIK_API_KEY` forventes å finnes og behøver ikke erstattes.

Aldri send API-token, kodekrypteringsnøkkel eller Pushover/Resend secrets i chat.
Kontroller https://eadgdcimcmfyuicizboo.supabase.co/functions/v1/gk-booking-notifier/health gir `configured:true, enabled:true`. Dette garanterer ikke Nuki-web/Keypad fysisk test.

## NESTE konkrete oppgaver hos assistenten etter eier har lagt inn Secrets
1. Kontroller service readiness og test leseadgang til Nuki (read-only GET, verifiser keypadPaired/keypad2Paired og smartlock 22722489119), + Pushover/Resend config uten testutsending til feil mottaker.
2. Fullfør/valider alle 33 produkter x rullerende 45 dager skjult lager 0, og ekte Quickbutik /cart/add + checkout fra golfkongen.no inkl. kundegrupper, rabatt, pilsett og godkjenning vilkår. Ingen publisering før test.
3. Foreta 1 reell fremtidig pilotbetaling/booking med eier, verifiser outbox > Pushover booking-varsel én gang > Nuki Web kode > Resend e-post > **fysisk kode på åpen dør** > kansellering og kode-revokering (og at slot frigjøres etter).
4. Etter alle tester og release gates, kontroller gamle bookinger mot nye sperrer, slå på ny checkout og sett Github repo variable GK2_CUSTOMER_CHECKOUT_LIVE=true. Ikke før.
