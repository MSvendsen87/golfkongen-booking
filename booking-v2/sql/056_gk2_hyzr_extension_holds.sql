-- HYZR extension payment-hold ledger. TESTING ONLY.
-- Uses the exact same claims table and per-date advisory lock as Booking 2.0.
-- Price basis is frozen at first extension request to avoid cumulative rounding
-- and to preserve the original actually paid discounted rate.
CREATE TABLE IF NOT EXISTS gk2_private.hyzr_extension_rate_basis(
 reservation_id uuid PRIMARY KEY REFERENCES gk2_private.reservations(id) ON DELETE RESTRICT,
 original_paid_ore integer NOT NULL CHECK (original_paid_ore>=100 AND original_paid_ore<=100000000),
 original_minutes integer NOT NULL CHECK(original_minutes>0 AND original_minutes<=720),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS gk2_private.hyzr_extension_holds(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL UNIQUE,
 reservation_id uuid NOT NULL REFERENCES gk2_private.reservations(id) ON DELETE RESTRICT,
 slot_date date NOT NULL,
 from_min integer NOT NULL,
 until_min integer NOT NULL,
 minutes integer NOT NULL,
 amount_ore integer NOT NULL CHECK (amount_ore BETWEEN 100 AND 100000000),
 reference text UNIQUE NOT NULL,
 state text NOT NULL DEFAULT 'payment_pending'
    CHECK(state IN ('payment_pending','capture_started','committed','expired','cancelled','review')),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 capture_started_at timestamptz,
 captured_at timestamptz,
 committed_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT gk2_ext_time_range CHECK(
   from_min>=0 AND until_min<=1440 AND from_min%30=0 AND until_min%30=0
   AND until_min>from_min AND minutes=until_min-from_min AND minutes<=240),
 CONSTRAINT gk2_ext_reference CHECK (reference ~ '^GK2EXT-[a-f0-9-]{36}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS gk2_hyzr_extension_one_pending
 ON gk2_private.hyzr_extension_holds(reservation_id)
 WHERE state IN ('payment_pending','capture_started');
CREATE INDEX IF NOT EXISTS gk2_hyzr_extension_day_expiry
 ON gk2_private.hyzr_extension_holds(slot_date,state,expires_at);
CREATE INDEX IF NOT EXISTS gk2_hyzr_extension_ref
 ON gk2_private.hyzr_extension_holds(reference);
ALTER TABLE gk2_private.hyzr_extension_rate_basis ENABLE ROW LEVEL SECURITY;
ALTER TABLE gk2_private.hyzr_extension_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON gk2_private.hyzr_extension_rate_basis FROM PUBLIC,anon,authenticated;
REVOKE ALL ON gk2_private.hyzr_extension_holds FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON gk2_private.hyzr_extension_rate_basis TO service_role;
GRANT SELECT,INSERT,UPDATE ON gk2_private.hyzr_extension_holds TO service_role;
