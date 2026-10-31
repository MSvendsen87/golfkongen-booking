# Booking 2.0 – staging v40 readiness, 27 October 2026

## Completed in this block
- Existing hidden Quickbutik club product **1507**, date variants 306095–306100 retained unpublished at 50 NOK and zero stock.
- New private RLS `gk2_private.club_checkout_leases` and service-only `gk2_club_checkout_plan(uuid)`. Plan refuses nonexistent/expired holds and disabled date mappings; all six mappings remain disabled.
- Service-only `gk2_match_club_paid_order` matches a unique still-valid club hold to verified order number/SKU/email/quantity/exact amount and sets confirmation idempotently under the shared day advisory lock; protects dart collisions.
- Service-only `gk2_cancel_club_by_order` permits order-based cancellation only after caller has independently verified cancellation with Quickbutik.
- Edge `gk-booking-v2` deployed **v40 ACTIVE** with separated club branch in authenticated Quickbutik webhook: orders read directly from Quickbutik V1 after signed webhook guard; insists exact one product 1507 line, correct date SKU, quantity 1–10, NOK, no shipping or refunds and 50 NOK per seat based on authoritative paid amount. Calls the matching RPC only if all guards pass. Signed cancelled order with Quickbutik V1 status -1 uses club cancellation RPC. The DB RPCs do NOT themselves prove payment; the Edge caller must.
- Previous database rollback tests verified status-based collision and 10-seat capacity. This block added SQL function and code deploy, **no real paid end-to-end verification**.
- Latest readback: 6 club dates, **0 enabled**, 0 leases, 0 enrolments, release gates closed. Min Bag production untouched.

## BLOCKERS BEFORE USER'S LIVE DOOR TEST / PUBLIC CUTOVER
1. Customer checkout must allocate and lease date-specific Quickbutik variant atomically and add to customer's real Quickbutik cart; variant stock still 0 and hidden; thus no club orders can actually be purchased. Order webhook alone is not a customer checkout.
2. Implement durable lease/expiration and recovery, including credit card capture racing against 10-minute hold. Current matcher returns manual review for expired hold. No automatic sale allowed.
3. Club confirmation currently does NOT queue Nuki/Resend/Pushover. Edge explicitly returns `doorCodeQueued:false`, `manualAccessRequired:true`.
4. Verify production paid/order readback fields and allow real test of club and regular bookings; protect/minimize existing legacy booking overlap; check all launch gates and env gates independently.
5. Customer Supabase Auth registration/sign-in UI for the club flow and owner admin UI need actual browser E2E verification.
6. Controlled cutover of all public booking links after old paid claims reconciliation, never open while gates false.

## Operational consequence
Do not tell owner that everything is live, that code will automatically arrive, or that a public booking test is possible. Their planned on-site visit may be used to test existing Nuki keypad and a manually issued fallback only if separately verified; booking-to-door automation is NOT ready.
