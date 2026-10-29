# Club evening paid-order verification — 2026-10-29

Order 3736: authoritative Quickbutik V1 readback and connected order API both confirm NOK 50 paid for one place on 2026-11-05, 19:00–22:00, no rental, shipping or refund.

## Defect and repair
V1 returns discount_amount=null when no discount exists. The club validator rejected this despite explicit paid and gross amounts both being 50.00. Accept null discount only when independently supplied paid equals gross and expected server price. Missing explicit payment plus unknown discount still fails closed. The paid held enrolment was reconciled against its exact checkout SKU and verified customer; payment was not charged again.

## Verified production outcomes
- Enrolment confirmed, checkout variant relocked/hidden.
- One shared Nuki authorization enabled on correct lock; 2026-11-05 17:45–21:15 UTC = 18:45–22:15 Europe/Oslo.
- Shared access confirmation accepted by Resend and delivered.
- Pushover API accepted one club booking notification; durable receipt saved. Phone display is not independently verifiable.
- Normal holds for HYZR, dart A, dart B and whole venue rejected with club_already_reserved in rollback-only checks.
- One club seat occupied, nine remaining.
- Product 1507 image ready on Quickbutik CDN.
- Temporary read-only diagnostic disabled (410).

## Improvements
Durable service-only push claims prevent blind duplicate retries after ambiguous network errors. Unknown/sending states need staff review rather than automatic resending.
Booking access emails now show readable date, time, actual paid price where independently available, rental choice, and appropriate shared/personal access window. Club checkout option labels omit the internal reference suffix on new variants; technical SKU remains unchanged for reliable payment matching.
Native Quickbutik order specification is not customizable through supported self-service settings (Quickbutik help article: https://quickbutik.com/no/hjelp/hvordan-gjor-jeg-endringer-i-butikkens-ordrebekreftelse). Native receipt retains its article number. General introduction/subject can be edited in store settings; not changed here.

## Validation
18 Node tests passed covering payment null-discount handling, rejected mismatches/refunds/shipping, shared access lifecycle, ambiguous push failure, booking email summaries and existing normal notifier behavior. SQL production overlap checks rollback without creating bookings. Physical keypad operation remains to be tested at the door.
