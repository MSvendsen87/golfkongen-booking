# Booking 2.0 — automatic rolling calendar, 29 October 2026

## Active implementation

- Backend `eadgdcimcmfyuicizboo`; Edge Function `gk2-rolling-calendar` version 1.
- Supabase cron job `gk2-rolling-calendar-nightly`, active schedule `0-32 3 * * *`: 33 invocations once each night, 03:00-03:32 UTC (04:00-04:32 winter / 05:00-05:32 summer in Norway).
- Each invocation leases the least recently checked booking product. All 33 products are checked during a single 33-minute nightly pass, with three days of prewarming beyond the public 45-day booking window.
- Dates are computed in the database using Europe/Oslo and existing booking settings. First bookable date remains 1 November 2026.
- Existing Quickbutik key stays in Edge Function environment; requests use the existing Vault-backed, time-limited cron HMAC verification.
- Queue, five-minute worker lease and completion status are in private RLS-enabled `gk2_private.calendar_sync_state`. Only service_role can invoke the worker RPCs. No new public table access.
- Each invocation creates at most 60 variants, in batches of at most 25. Adds only missing SKUs, reads back each write, then hides new variants with zero stock.
- Existing variants, parent visibility, regular prices and booking inventory are checked for unexpected changes. No parent visibility or price updates are sent.
- Recovery of an interrupted add repairs only zero-stock variants beyond the current public booking horizon. It does not repair live customer carts.
- An uncertain write stops the invocation; later runs reread by SKU instead of blindly retrying the write.

## Verification

- All 33 products, resources and durations read back complete through 16 December 2026, no missing expected SKUs.
- Actual prewarming created 573 new variants for 16 December. All new variants verified hidden, zero stock, correct SKU and regular price.
- HYZR product 1474 repeated after the initial full pass: complete, created 0, repaired 0, remaining 0 (HTTP 200).
- Cron itself executed successfully at 08:31 UTC during temporary minute-frequency verification. Schedule subsequently reduced to one nightly pass at user request; old 15-minute job removed. The future nightly pass has not yet occurred.
- Minute-level notification, cancellation and expired-cart cleanup job remains active (`* * * * *`).
- Unsigned POST rejected with HTTP 403.
- Four worker tests plus nine existing cleanup/signature/adapter tests pass.
- Rollback SQL checks verified exclusive product leases, invalid-token rejection and Oslo-based target date.
- Security advisors: no new warning category; private queue has RLS and no public policies by design. Existing leaked-password-protection warning remains unrelated.

## Source

- `sql/034_rolling_calendar_worker.sql`
- `sql/035_schedule_rolling_calendar.sql`
- `supabase/functions/gk2-rolling-calendar/`

The old Node rolling-sync script is not scheduled. Supabase cron is the sole automatic calendar writer. GitHub Actions scheduling and extra repository secrets are unnecessary for this implementation.

## Next launch item

Payment amount validation and customer-group discount combinations. Physical Nuki test and refund reconciliation remain open.
