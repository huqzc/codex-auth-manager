CREATE TABLE IF NOT EXISTS vault_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_files (
  identity_key TEXT PRIMARY KEY,
  encrypted_auth_json TEXT NOT NULL,
  iv TEXT NOT NULL,
  algorithm TEXT NOT NULL,
  account_id TEXT,
  user_id TEXT,
  email TEXT,
  plan_type TEXT,
  alias TEXT,
  account_updated_at TEXT,
  saved_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_files_saved_at ON auth_files(saved_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_files_email ON auth_files(email);
