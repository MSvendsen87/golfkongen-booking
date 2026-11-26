# Booking 2.0 – resource, price and native integration verification (27 October)

## Completed
- Installed migration `gk2_availability_claims_and_venue_hours` on staging eadgdcimcmfyuicizboo only. Availability now retains expired holds with unclosed Quickbutik leases. Hold enforces venue's own opening hours, in addition to all physical resource hours.
- Executed TEST_026_all_durations_ROLLBACK.sql successfully against real staging: all 33 durations, mutual venue/activity overlaps, independent parallel resources, interval boundaries, idempotency, protected expired carts and own venue hours. Entire transaction rolled back. Existing reservation/24 claims unchanged.
- Function grants verified: neither anon nor authenticated can execute the private booking RPCs; service_role can; both remain SECURITY INVOKER.
- Full live read-only price and catalogue audit run 40495095530 succeeded: 33 products; 23,493 expected/found SKUs; 0 missing, unsafe, duplicate or price errors. All public product and variant prices match data/public-prices.json, derived from existing database public price rows.
- All 33 checkout plans now have verified_variant_calendar=true. is_ready=0 and publish_enabled=0 remain.
- All 53 paid orders created since 1 September reconciled (119 total paid/pending/voided rows, no list truncation). Order 3669 needed a second read and was ordinary equipment. Relevant legacy booking lines: order 3702 is past (24 Oct 17–21); future order 3662 is venue 31 Oct 18–22 and is already represented correctly. No new reservation imported. legacy_paid_orders_verified=true; seven remaining gates false.
- Existing main-branch rolling variant job checked: 22:05 and 23:05 UTC, checks out preview branch, idempotent hidden/stock-zero creation. No new scheduler created.
- Frontend shows ordinary price and rental total, while authenticated group/coupon price remains Quickbutik's responsibility. Fixed stale availability-response race on rapid date changes. 109 Node tests pass.
- Browser checked published preview: venue Saturday 7 Nov, 4h: starts before 16:00 disabled, 16:00 onward available until latest allowed start; 2 rental sets yields 850 NOK ordinary total.

## Native GolfKongen integration prepared
- Actual /aktiviteter content belongs to category 144, not a normal Page.
- Editor: https://platform.quickbutik.com/i/admin/products/category_edit/144
- Preserve existing description 1. Append booking-v2/STOREFRONT_INSTALL_20261027.html. Generated docs/booking/embed.js is published on existing GitHub Pages; fetched bytes matched local build.
- Loader remains invisible when server gates are closed; existing customer links remain. ?booking2=preview exposes a safe native preview with checkout still locked. Once both real server flags pass, existing HYZR/dart/venue cards route to the in-page calendar. Club-night link remains separate.
- **NOT installed on GolfKongen yet.** Owner securely signed in via browserAuth; dashboard and category editor verified. On opening customer administration, Cloudflare security verification loop blocked this cloud browser; one reload did not clear it. Bot-block report recorded. Do not bypass or claim page save happened.

## Remaining exact blockers
- Verify existing 121 entered group-price overrides in actual Quickbutik admin/checkout, not just the staging entered_reported flags. Do not re-enter them blindly.
- Controlled whole booking hold/cart/paid-webhook/confirmed/outbox test remains; latest pilot script now adds an isolated anonymous exact-variant cart check and always relocks. Do not count a script commit as passed before its run is inspected.
- Preserve and integrate Thursday club priority 19–22 and conditional Tuesday 00:01 release with existing club registrations. This legacy rule is not yet installed in new DB. legacy_rules_verified must stay false.
- Verify old/new booking cutover, legacy cron transition, checkout shipping and tax, actual concurrent customer checkout, auto email/Pushover/Nuki provisioning and revocation.
- Backup door PIN is private owner fallback only; not stored in repository or customer frontend. Physical lock test can wait, other blockers cannot be waived by the backup PIN.

## Subsequent verified results
- All 33 product title/description updates succeeded, retaining Booking 2.0 prefix and hidden products. Removed customer-facing TESTKJØP/SKJULT/IKKE AKTIV wording; descriptions point to /aktiviteter and require actual paid reservation confirmation. Only title/description/weight=0 changed; no prices or group overrides changed. Weight zero alone is NOT proof of free checkout shipping.
- Cart pilot run 40496437437 / job 122162959616 succeeded. Exact SKU 2026-11-04-1000-1030, product 1474, variant 282560, quantity 1, isVariant=1, rawId=1474, actual anonymous unit price 90 NOK, one cart item. No checkout/payment/order. Final readback confirmed hidden=true, stock=0, price=90 after relock. This verifies the frontend raw_id assumption against real variant output.
- Read-only club catalogue: future Thursday variants 29 Oct through 10 Dec all currently have 10/10 capacity. That snapshot is not a dynamic club-priority implementation; do not mark legacy_rules_verified true.
