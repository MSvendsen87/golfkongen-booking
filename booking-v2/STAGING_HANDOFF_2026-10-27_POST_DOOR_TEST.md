# Booking 2.0 – staging readiness handoff (2026-10-27, after verified Nuki door test)

## Real verified on site
Owner-created free Booking 2.0 reservation for Dart A, 17:00–17:30 on 27 Oct 2026 successfully generated a Nuki Keypad authorization and emailed the code to the owner; the owner confirmed the door opened at 16:55. New code rules were then deployed in notifier v22: authorization valid from 15 minutes before start, customer is told 10 minutes before, expiry unchanged. The existing 27 Oct test keeps its original period.

## Changes completed in this development block (staging / preview)
1. Replaced `gk2_mark_cart_variant_open(uuid,integer)` in staging. After verified Quickbutik variant open, the matching, private 10-minute DB hold is extended ONCE to at least 30 minutes; retries do not extend it. Strict day advisory lock, role checks, immutable variant identity.
2. Added `gk2_checkout_hold_expires(uuid)`; only service_role can read the verified, active lease deadline. Staging API `gk-booking-v2` **v42 ACTIVE** returns the true extended expiry rather than the stale initial 10-minute expiry.
3. Corrected club Quickbutik date SKU regex, rejected conflicting gross/discount/paid amount fields, and hardened `gk2_match_club_paid_order` against webhook replay when another same-customer club hold exists. Staging v41 then v42 deployed.
4. Customer static source `docs/booking/index.html` now caches idempotency keys per SHA-256 checkout intent, to prevent repeated taps/retries from creating different reservations. Rebuilt `docs/booking/embed.js` and verified markup and script match the source.
5. Executed multiple rollback-only staging SQL tests: extension/retry guard, active checkout not prematurely cleaned, expired lease closes and releases claims, paid club order idempotency with a second hold. Stored repeatable transaction fixture in `booking-v2/sql/TEST_029_checkout_hold_club_replay_ROLLBACK.sql` and ran it successfully.
6. Audited all **33 Quickbutik duration products**, verifying 41 dates (2026-11-01–2026-12-11) with expected per-day variant counts, hidden variants and stock 0. One harmless hidden/zero-stock legacy test SKU exists on product 1477. No product, price, category, Quickbutik inventory or customer group price was changed.
7. Persisted previously staging-only changes in migration files: `028a_shared_club_schema_STAGING_ONLY.sql`, `028b_shared_club_owner_and_hold_STAGING_ONLY.sql`, `028c_shared_club_payment_STAGING_ONLY.sql`, `028d_shared_club_collision_overrides_STAGING_ONLY.sql`, `029_checkout_hold_and_club_replay_STAGING_ONLY.sql`.

## Last verified states
- Edge API v42 ACTIVE, notifier v22 ACTIVE.
- 33 duration-product plans; 0 flagged ready/published.
- 0 active checkout variant leases, 0 club enrollments.
- Public release gates still CLOSED.
- Min Bag production unaffected.
- Existing customer group prices are accepted as configured by the owner, not re-audited.

## Remaining critical work before launch
- **Quickbutik public activities theme**: rendered `https://golfkongen.no/aktiviteter?booking2=preview` does NOT currently show Booking 2.0 preview, even though `https://msvendsen87.github.io/golfkongen-booking/booking/` works. A controlled theme/page integration is needed; do not replace old booking links before paid migration and end-to-end verification.
- **Actual Quickbutik paid checkout**: a real cart/paid order test is still needed to verify hidden-parent variant add, the correct customer group price, signed webhook, Nuki/Pushover/Resend outbox. API and DB are prepared but ENV and release gates intentionally off.
- **Lease cleanup automation**: pg_cron/pg_net are not installed in staging; no demonstrated scheduled cleanup through the existing GH workflows, some prior workflow runs failed. The signed `/internal/relock-expired` endpoint exists and rollback DB cleanup tests pass, but an authorized, reliable recurring caller must be installed and tested.
- **Club customer checkout**: date variants remain disabled and zero stock, web customer membership-login/hold-to-cart and club Nuki notifications are unfinished. No false payment-confirmation claims.
- Carefully reconcile existing paid old bookings and remove old routes only after safe cutover. Do not flip safety gates merely to show live.

## Operational next priority
1. Add and verify a scheduled maintenance caller for `/internal/relock-expired` using secrets, without opening it to browsers.
2. Prove one real Quickbutik paid booking-to-Nuki path with owner (test purchase and possible refund) including 30-min lease, cart readback, signed paid webhook, notifications.
3. Connect the verified Booking 2.0 storefront embed to Quickbutik `/aktiviteter` only after prior two steps pass, then deploy/activate after all gates are really verified.

Do not call the public system live prematurely. No additional onsite Nuki test is needed for the basic authorizations; owner already confirmed successful unlock.
