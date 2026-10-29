# Unified admin price overview — 29 October 2026

Fixes the duplicate price/status sources in Booking 2.0 admin.

- Both the matrix and customer-group overview read effective prices from gk2_private.admin_price_values.
- Both use the same version-matched manual_price_checks records.
- Queue exposes manual_checked / pending_manual display states. Historical Quickbutik entry/checkout records are retained separately and are not rewritten or misrepresented as automatic checkout verification.
- The overview is labelled Kundegruppepriser – samlet kontrolloversikt. Filters, counts, status badges and copied prices use the shared admin values.
- Checkbox changes and saved/approved display-price changes automatically refresh both views.
- Existing prices and approvals retained. Initial verification: 24 approved display prices. Staff Dart A 60 minutes is 240 ore in both views, not the old 1500 ore.
- Rollback test compares every queue price/approval to the matrix and verifies unchecking is shared; historical entry records remain unchanged.
- Frontend test verifies saved 2.40/3.00 prices, status labels, filtering and updated uncheck data. JavaScript syntax checks pass.
- No Quickbutik prices, live booking price_policies, orders or Nuki changes.
