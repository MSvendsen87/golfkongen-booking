-- Booking 2.0 — release gate declaration (STAGING ONLY)
-- In the complete staging bundle this table is inserted before gk2_hold_slot
-- and gk2_hold_slot performs the complete gate check before writing any reservations.
-- DO NOT run this file by itself as proof that the original gk2_hold_slot is gated.
BEGIN;
CREATE SCHEMA IF NOT EXISTS gk2_private;
CREATE TABLE IF NOT EXISTS gk2_private.release_gates (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton=true),
 legacy_paid_orders_verified boolean NOT NULL DEFAULT false,
 legacy_rules_verified boolean NOT NULL DEFAULT false,
 customer_group_prices_verified boolean NOT NULL DEFAULT false,
 checkout_paid_webhook_verified boolean NOT NULL DEFAULT false,
 pushover_end_to_end_verified boolean NOT NULL DEFAULT false,
 admin_auth_verified boolean NOT NULL DEFAULT false,
 concurrency_verified boolean NOT NULL DEFAULT false,
 legacy_cron_switch_verified boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO gk2_private.release_gates(singleton) VALUES (true) ON CONFLICT DO NOTHING;
ALTER TABLE gk2_private.release_gates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON gk2_private.release_gates FROM PUBLIC,anon,authenticated;
COMMIT;

-- Mandatory guard inside gk2_hold_slot AFTER the service_role auth check
-- and BEFORE any reservations/claims INSERT:
-- IF NOT EXISTS (
--   SELECT 1 FROM gk2_private.release_gates WHERE singleton
--     AND legacy_paid_orders_verified AND legacy_rules_verified
--     AND customer_group_prices_verified AND checkout_paid_webhook_verified
--     AND pushover_end_to_end_verified AND admin_auth_verified
--     AND concurrency_verified AND legacy_cron_switch_verified
-- ) THEN RAISE EXCEPTION 'booking_v2_release_gates_not_satisfied'; END IF;
