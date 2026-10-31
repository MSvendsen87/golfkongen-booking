# Booking 2.0 — cart cleanup, 29 October 2026

Live booking backend: `eadgdcimcmfyuicizboo` (project name still contains staging).

## Completed

- Applied `033_cancelled_and_expired_cart_cleanup.sql` to the live booking backend.
- Deployed `gk2-notifier-cron` version 2, extending the existing signed minute job.
- Existing protected cleanup endpoint reads and verifies Quickbutik stock 0 / hidden before closing each lease and releasing expired claims.
- Includes cancelled, refunded and already-expired reservations in cleanup candidates.
- Uses the checkout date advisory lock and prevents new leases reusing an unclosed SKU.
- Skips old leases if another active checkout currently owns the same SKU.
- Existing retry limit and stale-worker recovery remain in force. Failed closes retain their lease.

## Verified

- Nine existing HMAC / Quickbutik adapter tests pass.
- Transactional rollback test selected exactly five stale leases, rejected duplicate acquisition, closed them, cleared claims and retained confirmed reservations.
- Separate rollback test protected a reused SKU with a live checkout and retained a failed close for retry.
- Actual scheduled execution at 08:23 UTC: HTTP 200, processed 5, closed 5, failed 0.
- Subsequent execution: HTTP 200, processed 0, failed 0.
- All 12 tracked leases now closed; three expired holds transitioned to expired; two cancellations retained cancelled state.
- No claims remain attached to cancelled, refunded or expired reservations. Confirmed booking retained.

## Next

The branch has a rolling-sync script but no `gk2-rolling-variants.yml` workflow. Main branch has no Booking 2.0 implementation; GitHub scheduled jobs require a workflow on the default branch. Do not report automatic calendar continuation as enabled until a scheduler, credentials, actual run and calendar readback have been verified.

Remaining launch controls: payment amount and discount combinations, physical Nuki test, cancellation/refund reconciliation, concurrent bookings, mobile/customer flow, membership/club events.
