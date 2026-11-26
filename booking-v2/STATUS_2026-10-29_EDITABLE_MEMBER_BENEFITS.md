# Editable welcome-popup benefits — 29 October 2026

- Existing popup design/styles preserved byte-for-byte.
- Staff retains confirmed 98% simulator and dart booking descriptions (hourly admin prices 3 NOK / 2.40 NOK).
- Existing store discount descriptions preserved: staff 30%, Team 30% specified equipment, ambassador 15%, club equipment 10%. These percentages cannot be independently verified through the connected product/order API; no actual discount rules changed.
- Simulator 100/120 NOK and dart 100 NOK descriptions compared to current hourly admin price records.
- Private group_benefit_texts stores eight text configurations. Legacy medlemmer retains its original disc-only benefits; combined membership keys remain separate.
- Public GET /member-benefits returns published descriptions only, never customer membership data.
- Authenticated /admin/benefits and /admin/benefit-save require existing JWT/allowlist and service-role RPC authorization. Versioned saves reject stale edits.
- New editor and same-design preview in Rabattgrupper. Text changes do not alter membership, access, checkout prices or actual discounts.
- Popup fetches current text on each opening, with four-second timeout and local fallback. Existing group priority logic retained; club-night lines deduplicated; rendered text escaped.
- SQL rollback tests pass: eight groups, staff 98%, original member preserved, public text updates after save, unknown fields stripped, stale saves rejected, price_policies checksum unchanged.
- Three popup/preview tests pass: staff precedence, dynamic text updates, legacy member isolation, unavailable-backend fallback, HTML escaping.
- Booking backend deployed version 62.
- Popup repository commit: 93c926e23bb89767d3fd1fa6a98dae5a92ef4965.

## Activation boundary

The existing storefront loader is pinned to c11cb57. The script API denied reads with HTTP 403, so no storefront script was modified. The temporary signed installer was disabled (HTTP 410); no scheduler was created.

To activate the customer popup, change only the commit in the existing Quickbutik script Medlem popup loader from c11cb57 to 93c926e (full commit 93c926e23bb89767d3fd1fa6a98dae5a92ef4965). A complete replacement loader is saved in booking-v2/scripts/member-popup-loader-20261029.js. Until this one loader change, customer popup text remains the old pinned version, while admin editing and the public config API are already ready.
