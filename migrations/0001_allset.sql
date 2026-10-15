-- AllSet: leads from /allset/, rate limits, D1 fallback jobs and processed Stripe events.
-- Apply: npx wrangler d1 migrations apply esbjug-allset --remote   (see ALLSET.md)
-- Times are Unix milliseconds.

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,                -- random UUID, also the secret part of /allset/preview/<id>
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  site_url TEXT NOT NULL,
  -- queued → processing → preview_ready | failed; then preview_paid and/or paid (full site)
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  site_title TEXT,
  preview_session_id TEXT,
  preview_paid_at INTEGER,
  full_amount_cents INTEGER CHECK (full_amount_cents IS NULL OR full_amount_cents >= 250000),
  full_session_id TEXT,
  full_checkout_url TEXT,
  full_checkout_expires_at INTEGER,
  paid_at INTEGER
);
CREATE INDEX IF NOT EXISTS leads_created ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS leads_email ON leads (email);

-- Used only when the PREVIEW_QUEUE binding is missing or the send fails. Run with
-- POST /api/allset/admin/process-jobs (the admin page has a button).
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id TEXT NOT NULL REFERENCES leads (id),
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | running | done | failed
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_open ON jobs (status, id);

-- key = "ip:<sha256 of ip>:<hour>" or "day:<day>"; the window is part of the key.
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limits_expires ON rate_limits (expires_at);

-- Stripe retries webhooks; an event id is applied once.
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
