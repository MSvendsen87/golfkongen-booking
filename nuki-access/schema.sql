-- Dedicated D1 database: this does not modify Quickbutik or GolfKongen Supabase.
-- Deploy once with wrangler d1 execute <DB_NAME> --file=nuki-access/schema.sql
CREATE TABLE IF NOT EXISTS booking_access (
  booking_key TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  line_id TEXT NOT NULL,
  product_id INTEGER NOT NULL,
  booking_type TEXT NOT NULL,
  booking_date TEXT NOT NULL,
  booking_from TEXT NOT NULL,
  booking_to TEXT NOT NULL,
  start_utc TEXT NOT NULL,
  end_utc TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  code_ciphertext TEXT NOT NULL,
  auth_name TEXT NOT NULL,
  nuki_auth_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','creating','verifying','sent','cancel_requested','revoking','revoked')),
  sent_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS booking_access_expiry ON booking_access(status,end_utc);
CREATE INDEX IF NOT EXISTS booking_access_order ON booking_access(order_id);
