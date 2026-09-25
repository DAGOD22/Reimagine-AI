import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const schema = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_guest INTEGER NOT NULL DEFAULT 0,
  demo_project_used INTEGER NOT NULL DEFAULT 0,
  has_password INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider IN ('google', 'microsoft')),
  provider_account_id TEXT NOT NULL,
  provider_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider, provider_account_id)
);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user ON oauth_accounts(user_id);

CREATE TABLE IF NOT EXISTS oauth_states (
  id TEXT PRIMARY KEY,
  state_hash TEXT NOT NULL UNIQUE,
  browser_hash TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('google', 'microsoft')),
  code_verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  return_to TEXT NOT NULL,
  guest_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  room_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  instructions TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  guest_generation_claimed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_user_updated ON projects(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS project_images (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('original', 'reference', 'generated')),
  file_path TEXT NOT NULL,
  thumbnail_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  filename TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  version_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_images_project_kind ON project_images(project_id, kind, created_at DESC);

CREATE TABLE IF NOT EXISTS project_files (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'document',
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  extracted_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'space',
  payload_json TEXT NOT NULL,
  raw_response TEXT NOT NULL,
  model TEXT NOT NULL,
  request_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analyses_project ON analyses(project_id, kind, created_at DESC);

CREATE TABLE IF NOT EXISTS renovation_plans (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL,
  raw_response TEXT NOT NULL,
  model TEXT NOT NULL,
  request_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plans_project ON renovation_plans(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  image_id TEXT,
  parent_id TEXT,
  prompt TEXT NOT NULL,
  provider TEXT NOT NULL,
  plan_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(project_id, number)
);
CREATE INDEX IF NOT EXISTS idx_versions_project ON versions(project_id, number DESC);

CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency TEXT NOT NULL,
  target_budget REAL NOT NULL,
  work_mode TEXT NOT NULL,
  finish_level TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_budgets_project ON budgets(project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS product_recommendations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_project ON product_recommendations(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS design_messages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_design_messages_project ON design_messages(project_id, created_at ASC);

CREATE TABLE IF NOT EXISTS preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  appearance TEXT NOT NULL DEFAULT 'system',
  currency TEXT NOT NULL DEFAULT 'USD',
  units TEXT NOT NULL DEFAULT 'metric',
  ai_detail TEXT NOT NULL DEFAULT 'balanced',
  privacy_mode TEXT NOT NULL DEFAULT 'standard',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  task TEXT NOT NULL,
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  http_status INTEGER,
  error_code TEXT,
  error_message TEXT,
  latency_ms INTEGER,
  image_count INTEGER NOT NULL DEFAULT 0,
  request_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_requests_project ON ai_requests(project_id, created_at DESC);
`;

type GlobalWithDb = typeof globalThis & { __hearthformDb?: Database.Database };

export function getDb(): Database.Database {
  const globalDb = globalThis as GlobalWithDb;
  if (globalDb.__hearthformDb) return globalDb.__hearthformDb;

  // Keep the default database statically scoped under data/ so deployment tracing
  // never sweeps the repository. DATABASE_PATH may customize the file name.
  const configuredName = path.basename(process.env.DATABASE_PATH || "hearthform.db");
  const dbPath = path.join(process.cwd(), "data", configuredName);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(schema);
  const userColumns = db.pragma("table_info(users)") as Array<{ name: string }>;
  if (!userColumns.some((column) => column.name === "is_guest")) {
    db.exec("ALTER TABLE users ADD COLUMN is_guest INTEGER NOT NULL DEFAULT 0");
  }
  if (!userColumns.some((column) => column.name === "demo_project_used")) {
    db.exec("ALTER TABLE users ADD COLUMN demo_project_used INTEGER NOT NULL DEFAULT 0");
    db.exec("UPDATE users SET demo_project_used = 1 WHERE is_guest = 1 AND EXISTS (SELECT 1 FROM projects WHERE projects.user_id = users.id)");
  }
  if (!userColumns.some((column) => column.name === "has_password")) {
    db.exec("ALTER TABLE users ADD COLUMN has_password INTEGER NOT NULL DEFAULT 1");
    db.exec("UPDATE users SET has_password = 0 WHERE is_guest = 1");
  }
  const projectColumns = db.pragma("table_info(projects)") as Array<{ name: string }>;
  if (!projectColumns.some((column) => column.name === "guest_generation_claimed_at")) {
    db.exec("ALTER TABLE projects ADD COLUMN guest_generation_claimed_at TEXT");
  }

  globalDb.__hearthformDb = db;
  return db;
}

export function nowIso() {
  return new Date().toISOString();
}

export function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}
