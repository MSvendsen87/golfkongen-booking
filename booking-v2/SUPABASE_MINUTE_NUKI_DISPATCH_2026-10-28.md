# Booking 2.0 – Automatisk Nuki/varsel-retry i Supabase (28.10.2026)

## Bakgrunn
Ordre 3727 ble betalt og bekreftet; første Nuki PUT ble akseptert men svaret ble ikke synlig i Nuki-autorisajonslisten før senere. Varslingsjobben i GitHub Actions med `*/5 * * * *` ga ingen tidsriktig oppfølging etter første forsøk. En manuell idempotent kjøring bekreftet opprinnelig kode og sendte e-post. **Det var ikke feil på betalingen eller reserveringen.**

## Tiltak i drift
- Supabase-prosjekt: `eadgdcimcmfyuicizboo`.
- `pg_cron` og `pg_net` installert.
- Vault-hemmelighet **kun navngitt her, aldri verdien:** `gk2_notifier_cron_signing_key_20261028`.
- RPC: `public.gk2_verify_cron_dispatch_signature(text,text)`, bare `service_role` har EXECUTE; krever gyldig 120-sekunders HMAC.
- Edge Function: `gk2-notifier-cron`. Bekrefter signert cron-forespørsel og kaller **eksisterende** `gk-booking-notifier/internal/dispatch` med allerede etablert Quickbutik-basert intern HMAC.
- Cron-jobb: `gk2-notifier-retry-every-minute`, `* * * * *`. Gjennomfører ingen direkte databaseoppdatering av reserveringer, koder eller betaling. Event-ID og outbox-claim sikrer idempotens.
- GitHub Actions `gk2-confirmed-booking-notifications.yml` beholdes som uavhengig backup.

## Verifiseringspunkter
- En manuelt signert `net.http_post` ga HTTP 200 og `{ok:true,processed:0}` på allerede tømt kø.
- Gyldig HMAC blir godkjent; ugyldig eller utgått signatur blir avvist.
- Bekreft at `cron.job_run_details` har jevnlige `succeeded` og `net._http_response` har HTTP 200.
- Sjekk `gk2_private.notification_outbox` og `booking_access_codes` for neste **ekte** betaling; ikke opprett duplikatordre eller kode bare for test.

## Drift og feilsøking
```sql
select jobid,jobname,schedule,active from cron.job
 where jobname='gk2-notifier-retry-every-minute';
select start_time,status,return_message from cron.job_run_details
 where jobid=(select jobid from cron.job where jobname='gk2-notifier-retry-every-minute')
 order by start_time desc limit 10;
select created,status_code,error_msg,left(content,180) from net._http_response
 order by created desc limit 10;
```

Gjenkjenning av fastlåste Nuki-hendelser styres fortsatt av `gk-booking-notifier` (retries, eksisterende kryptert kode, manuell alert). Ikke send tilgangskoder eller hemmeligheter i logger.

## Reversering
For å pause bare ekstra kjøringer: `select cron.unschedule('gk2-notifier-retry-every-minute');`. Da kjører GitHub Actions fortsatt, men er ikke tilstrekkelig presist for dørlås alene.
