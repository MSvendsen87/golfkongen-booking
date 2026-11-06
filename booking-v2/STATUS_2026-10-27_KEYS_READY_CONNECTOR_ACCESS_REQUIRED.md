# Booking 2.0 – 27. oktober 2026: Nuki/Pushover/Resend keys set

## Verified live without exposing secrets
- Live `gk-booking-notifier/health`: `{"ok":true,"enabled":false,"configured":true}`. Presence of `NUKI_API_TOKEN`, `NUKI_LOCK_ID=22722489119`, `GK2_CODE_KEY_BASE64`, `GK2_PUSHOVER_APP_TOKEN`, `GK2_PUSHOVER_USER_KEY`, `RESEND_API_KEY`, `GK2_QUICKBUTIK_API_KEY` confirmed by aggregate readiness. **This is NOT a provider API credential or mail delivery test.**
- Live `gk-booking-v2/health`: staging, `bookingEnabled=false`, `checkout=false`. No customer sale enabled.
- GitHub Actions pure tests pass, most recent run: https://github.com/MSvendsen87/golfkongen-booking/actions/runs/40474905908

## Supabase connected account blocker
ChatGPT's currently linked Supabase account lists only:
- `elleuevltdqojtommqke` – nordic-masters
- `fwztrnxhfvrlceicctlv` – golfkongen-booking-admin

The actual Booking 2.0 project `eadgdcimcmfyuicizboo` is **NOT authorized to the current Supabase plugin connection**. Supabase get_project/get_edge_function/execute_sql for it return `You do not have permission to perform this action`. DO NOT deploy or write to either other project. Owner must reconnect/switch the Supabase connector to the account that owns `eadgdcimcmfyuicizboo`. No need to re-enter secrets.

## Prepared but NOT deployed (GitHub staging branch)
- `booking-v2/supabase/functions/gk-booking-notifier/diagnostic-auth.mjs` – independently derived two-minute HMAC for read-only diagnostics; cannot reuse notification-dispatch signature.
- `booking-v2/supabase/functions/gk-booking-notifier/index.ts` – `POST /internal/diagnose` performs **GET ONLY** for Nuki device + authorization listing, plus Pushover `users/validate` (no push message); reports booleans only. This can run while the actual notifier stays disabled. Resend sending-only token cannot be validated by non-sending GET, so provider mail remains untested until owner-approved delivery pilot.
- `diagnostic-auth.test.mjs` + CI; tests passed on staging branch.

## Exactly next steps once Supabase connection restored
1. Confirm get_edge_function of `gk-booking-notifier` in project `eadgdcimcmfyuicizboo`; compare deployed files with staging source.
2. Deploy `index.ts` and `diagnostic-auth.mjs` from staging branch, retaining all existing function files and both `GK2_NOTIFIER_ENABLED=false`, `GK2_CHECKOUT_ENABLED=false` kill switches.
3. Use signed internal diagnostics (without exposing credentials): verify Nuki 22722489119 and keypad pairing/auth privileges; validate Pushover app/user pair.
4. Only after these pass, explicitly perform a controlled test notification and email to owner's verified address, a test Nuki code with short bounded time, physical testing with door open, and revocation. Do not touch legacy booking or send code to customer test data.
5. Finish real Quickbutik checkout tests, 45-day SKU coverage, release-gate checks and cutover. No product opened prematurely.
