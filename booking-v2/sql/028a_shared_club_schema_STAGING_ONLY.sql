-- Booking 2.0 shared club schema — STAGING ONLY.
-- Schema snapshot 2026-10-27, prior to SQL 029.
-- Requires existing gk2_private schema, booking_settings, release_gates,
-- reservations, claims and checkout_variant_leases.
-- Product 1507 variant IDs are specific to the GolfKongen Quickbutik shop.
-- Leave dates disabled until a verified real checkout is complete.

CREATE TABLE IF NOT EXISTS gk2_private.club_access_stage (
 customer_id text PRIMARY KEY, active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS gk2_private.club_access_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 customer_id text NOT NULL, actor text NOT NULL, active boolean NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS gk2_private.club_enrolments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 idempotency_key uuid NOT NULL UNIQUE,
 slot_date date NOT NULL CHECK (extract(isodow from slot_date)=4),
 customer_id text NOT NULL REFERENCES gk2_private.club_access_stage(customer_id),
 seats integer NOT NULL CHECK (seats BETWEEN 1 AND 10),
 status text NOT NULL CHECK (status IN ('held','payment_pending','confirmed','expired','cancelled')),
 hold_expires_at timestamptz,
 quickbutik_order_id text UNIQUE,
 verified_paid_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 verified_customer_email text,
 CHECK (status<>'confirmed' OR (quickbutik_order_id IS NOT NULL AND verified_paid_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS gk2_club_enrolments_day_idx
 ON gk2_private.club_enrolments(slot_date,status);
CREATE TABLE IF NOT EXISTS gk2_private.club_checkout_variants (
 slot_date date PRIMARY KEY CHECK(extract(isodow from slot_date)=4),
 quickbutik_product_id integer NOT NULL CHECK(quickbutik_product_id=1507),
 quickbutik_variant_id bigint NOT NULL UNIQUE,
 sku text NOT NULL UNIQUE,
 price_ore integer NOT NULL CHECK(price_ore=5000),
 enabled boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS gk2_private.club_checkout_leases (
 enrolment_id uuid PRIMARY KEY REFERENCES gk2_private.club_enrolments(id),
 variant_id bigint NOT NULL,sku text NOT NULL,
 lease_state text NOT NULL DEFAULT 'opening'
 CHECK (lease_state IN ('opening','open','closing','closed','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE gk2_private.club_access_stage ENABLE ROW LEVEL SECURITY;
ALTER TABLE gk2_private.club_access_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE gk2_private.club_enrolments ENABLE ROW LEVEL SECURITY;
ALTER TABLE gk2_private.club_checkout_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE gk2_private.club_checkout_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON gk2_private.club_access_stage,gk2_private.club_access_audit,
 gk2_private.club_enrolments,gk2_private.club_checkout_variants,
 gk2_private.club_checkout_leases FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON gk2_private.club_access_stage TO service_role;
GRANT SELECT,INSERT ON gk2_private.club_access_audit TO service_role;
GRANT USAGE,SELECT ON SEQUENCE gk2_private.club_access_audit_id_seq TO service_role;
GRANT SELECT,INSERT,UPDATE ON gk2_private.club_enrolments TO service_role;
GRANT SELECT,INSERT,UPDATE ON gk2_private.club_checkout_variants TO service_role;
GRANT SELECT,INSERT,UPDATE ON gk2_private.club_checkout_leases TO service_role;

INSERT INTO gk2_private.club_checkout_variants
 (slot_date,quickbutik_product_id,quickbutik_variant_id,sku,price_ore,enabled)
VALUES
 ('2026-11-05',1507,306095,'GK2-CLUB-2026-11-05',5000,false),
 ('2026-11-12',1507,306096,'GK2-CLUB-2026-11-12',5000,false),
 ('2026-11-19',1507,306097,'GK2-CLUB-2026-11-19',5000,false),
 ('2026-11-26',1507,306098,'GK2-CLUB-2026-11-26',5000,false),
 ('2026-12-03',1507,306099,'GK2-CLUB-2026-12-03',5000,false),
 ('2026-12-10',1507,306100,'GK2-CLUB-2026-12-10',5000,false)
ON CONFLICT(slot_date) DO NOTHING;
