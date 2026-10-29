# Admin display prices — 29 October 2026

User-requested scope: save and approve prices for display in Booking 2.0 admin only.

- Sportskongen internal portal remains at the user's current 161f0ffa04d73763574cd76e18a86647f334e81a; no edits to that repository.
- New private admin_display_prices table and security_invoker admin_price_values view keep display prices separate from live price_policies.
- Existing matrix, draft creation/listing and manual approval checkbox now use the effective admin display price and its version timestamp.
- New authenticated /admin/price-display-approve endpoint approves the exact draft version, records the display price and manual approval, and removes the approved draft.
- The form now saves and approves in one action. Older saved drafts have a separate approval button.
- No Quickbutik writes, price_policies writes, booking confirmations, calendar changes or gate changes.
- Deployed gk-booking-v2 version 61.
- Applied the existing user draft: HYZR, staff, 60 minutes = 300 ore (3 NOK), note 98% rabatt.
- Database readback: display price 300, manual approval 300, draft removed. Underlying booking policy remains 1500 ore.
- Rollback test passed: existing 3 NOK draft approval, manual uncheck, subsequent display-price edit, rejection of stale checkbox input, and full price_policies checksum unchanged.
- Frontend inline/module JavaScript syntax checks passed.
- Public/anonymous approval execution revoked; admin JWT/allowlist guards and service-role RPC checks remain enforced.

A display/manual approval record is not proof that a customer-group price was charged correctly in checkout. It does not enable exact-payment verification.
