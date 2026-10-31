# Booking 2.0 – staging club identity and checkout gate, 27 Oct 2026

## Installed and verified
- Edge function `gk-booking-v2` **v38 ACTIVE**: `POST /club/hold`, gated by `GK2_CHECKOUT_ENABLED=true`, `GK2_CLUB_CHECKOUT_ENABLED=true` and all existing database release gates. Requires allowed origin, verified Supabase Auth JWT and confirmed user email. `p_customer` is always taken from authenticated `user.id`; browser cannot submit/impersonate arbitrary member identifiers. Request requires UUID idempotencyKey, Thursday, 1–10 seats, acceptedTerms. Response deliberately says `paymentReady:false` and does not link to checkout.
- `gk2_admin_set_club_access` now accepts only UUID-shaped Supabase Auth user IDs. Member list remains owner-only; admin UI field and client validation updated accordingly.
- Quickbutik product 1322 (`LDK Tilgang`) inspected: hidden legacy product, 50 NOK, 41 old-date variants; not repurposed or made visible. This prevents accidental cross-system sale without an order match.
- Readback: Edge v38 ACTIVE, 0 enrolments, 0 member entries, existing release gates closed. No user-visible purchase flow enabled.

## Outstanding blocker (real implementation work, not user-supplied access)
There is no verified club checkout product/date variant with a trusted cart-first binding or paid Quickbutik order match. The new `POST /club/hold` therefore must remain fail-closed and not be advertised as purchase-ready. Complete club product setup + variant date-stock leasing + exact order price/lines verification + webhook confirm/cancel + notifications/Nuki before enabling the two env gates. Also implement a consumer login flow for verified membership and validate that it works with the existing customer journey. No production/minbag changes.
