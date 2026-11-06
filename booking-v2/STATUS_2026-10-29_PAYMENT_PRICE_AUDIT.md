# Booking 2.0 — payment and price audit, 29 October 2026

## Completed current catalogue checks

Read all 33 Booking 2.0 products through the connected Quickbutik API and compare their parent and variant prices to current public price policies in the booking database.

- 33 parent prices checked: all match.
- 26,359 future time variants checked (from 1 November onward): all regular prices match.
- No duplicate SKUs within any checked product.
- Includes the newly prewarmed 16 December variants.
- Read-only: no prices, customer groups, discounts, orders or stock changed.

## Automated verification

50 existing payment validation, V1 payment checker and webhook guard tests pass.
They cover paid/cancelled/unpaid orders, exact cents, gross/discount/net coherence, wrong customer, expired hold, wrong product/SKU, rental extras and webhook signature/replay inputs.

Important: exact-amount unit tests do not mean exact-amount enforcement is enabled in the live webhook. The current live path still calls checkV1BookingPayment with paymentPolicy trusted_status and confirms using gk2_confirm_paid_order_status.

## Historical order audit

| Order | Product | Current order state | Gross NOK | Order discount NOK | Recorded paid NOK |
|---|---|---|---:|---:|---:|
| 3662 | Legacy venue, 31 October | paid | 800 | 784 | 16 |
| 3712 | Dart A, 30 min | paid/completed | 80 | 78.40 | 1.60 |
| 3717 | Dart A, 60 min | voided/cancelled | 120 | 0 | 120 |
| 3727 | HYZR, 30 min, 10:00 | voided/cancelled | 10 | 0 | 10 |
| 3728 | HYZR, 30 min, 10:30 | voided/cancelled | 90 | 0 | 90 |

Source: authoritative connected Quickbutik order reads. Recorded paid values on voided orders do not establish whether a payment was captured, released or refunded at Vipps. These historical tests do not prove that the same discount setup remains active today. Preserve legacy paid booking 3662.

## Why the full payment/discount item remains open

- The live precheckout hold does not record a trusted expected customer-group net price.
- Live status-only confirmation checks order identity, paid status, customer email, slot SKU, lines, shipping and refunds; it does not compare the actual net amount to an independently authorized group price.
- Product API reads establish regular prices, not which price a signed-in customer receives on every time variant or when customer groups and campaigns overlap.
- The manual price checkbox is a human verification record; it must not be treated as server proof of a customer's membership or current paid amount.
- Do not blindly enable exact comparisons against public regular price: that would reject legitimate member/staff prices.

## Next concrete checkout test

Signed in as a confirmed staff-group customer, open a fresh HYZR 30-minute time variant (not only the previously configured 10:00 variant). Current staff target from price_policies is 10 NOK; public is 90 NOK.

Inspect the final checkout amount and discounts without paying. Then compare a second fresh time variant. If those match, continue with member pricing, 60-minute duration, overlapping groups and campaign discounts. Only mark rows manually checked after those real checks.

Full payment enforcement needs trusted group identity plus a net-price snapshot bound to the hold, or an equivalent authoritative checkout quote. This audit does not claim that implementation is complete.
