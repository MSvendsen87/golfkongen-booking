# Booking 2.0 – owner paid checkout pilot handoff (2026-10-27)

## Installed and verified in connected Supabase STAGING
- Booking API `gk-booking-v2` **v47 ACTIVE**; notifier `gk-booking-notifier` **v24 ACTIVE**.
- Role-and-admin-allowlist-gated owner-only checkout hold; first bookable day remains 2026-11-01.
- Owner pilot cannot enable public launch, modify general release gates, or alter Min Bag.
- Owner checkout may open only the one product/slot variant which matches an atomically reserved and accepted booking. Uses existing Quickbutik V1 adapter; test of actual V1 mutation remains pending.
- Owner pilot readback GET/POST protected by admin JWT. Paid order must be read **server-side** from Quickbutik V1, have paid status 1/2, NOK, no refunds or shipping, positive coherent paid amount, exactly one booking line matching stored slot SKU and email; then SQL binds it and confirms once; two notification events generated.
- Owner restricted notifier dispatcher pulls only owner pilot events from outbox and uses real Nuki, Resend and Pushover services. Notifier globally DISABLED; owner-only route can test without changing public launch.
- Owner pilot UI visible only at https://golfkongen.no/aktiviteter?gk2pilot=1. Must log into Supabase Auth owner email, select a slot on public widget, accept terms, click test reservation, then checkout. Return to same pilot URL after Quickbutik payment and enter the real Quickbutik order number. After server verifies payment, page polls owner-only notifier until actual Nuki email event is sent, then redirects to https://msvendsen87.github.io/golfkongen-booking/booking/takk/.
- Branded responsive booking confirmation email with activity, date, exact time, validated 6-digit Nuki PIN, and instruction: customer can use it 10min before; Nuki authorization is configured from 15min before.
- Dedicated thank-you page published. Does **not** pretend order is paid simply because page loads.
- SQL snapshot saved in `booking-v2/sql/030_owner_paid_pilot_STAGING_ONLY.sql`.

## DB test evidence
1. Transaction-rollback owner booking and lease initiation passed. Unauthorized actor rejected.
2. Transaction-rollback fake test payment order linked to owner hold, confirmed, exactly two outbox events (Pushover and Nuki/email), authorized claim passed, unauthorized claim blocked. No real order was created.
3. Transaction-rollback private delivery status authorization passed.
4. Final readback: zero owner pilot rows, zero outstanding open checkout leases, zero outbox events. Release gates remain 7/8 closed, ordinary storefront purchase remains disabled.
5. A separate real Nuki door owner test earlier confirmed physical keypad unlock; actual paid-order Nuki and mail are **NOT yet** proven with a real payment.

## Important limitations / next actions before full public launch
- A real owner Quickbutik payment has not happened. Product parents remain `visible=false`, all variants hidden and zero stock except when owner API deliberately opens a single held variant. Check if Quickbutik can add a temporary open variant from hidden parent; a prior separate GH workflow was written for this, but do not falsely claim success of the live paid pilot.
- The pilot test requires entering the paid Quickbutik order number after checkout, because no automatic Quickbutik payment callback/redirect has been configured. It is an end-to-end **controlled test**, not proof of full public automation.
- The dedicated thank-you page is on GitHub Pages until an authorized Quickbutik confirmation-page redirect can be installed and checked. Quickbutik's checkout template is not directly editable.
- The global Quickbutik paid webhook is disabled and the general notifier is disabled; signed automatic live flow and reliable stock-lease cleanup scheduler have to be proved before flipping production flags.
- Klubbkveld paid checkout is not activated; owner pilot currently covers ordinary HYZR, Dart A/B and whole venue products.
- Do not flip release gates as a shortcut, and do not unhide all 33 products/variants in advance (risks purchases without DB holds).
- On test failure, do not have owner pay again; check the current cart/lease and Quickbutik status.

## First owner test
1. Open https://golfkongen.no/aktiviteter?gk2pilot=1
2. Select 2026-11-01 or later; suggest 30min Dart A for simplest product, at an available time.
3. Log in under owner Supabase Auth account; use the **same email** in Quickbutik checkout.
4. Select slot, check test terms, click "Reserver valgt tid og gå til betaling" and complete real payment.
5. Return to test URL; log in if needed; enter the actual Quickbutik paid order number and verify until Nuki email is confirmed.
6. If access code arrives, check Pushover and thank-you redirect, then reconcile all gates before ordinary public launch.

## Additional completed readback fixes
- Quickbutik V1 customer e-mail verification now accepts only a single consistent verified email across customer.email, customer.email_address or customer_email, while rejecting contradictory identities. Installed v47.
- Confirmed Quickbutik product 1318 is **Leie av pilsett**, 25 NOK; no add-on purchased during setup.
- The dedicated branded confirmation email now renders HTML and plaintext after confirmed Nuki authorization; staging notifier v24.
