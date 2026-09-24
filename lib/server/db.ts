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

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  room_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  instructions TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
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

  globalDb.__hearthformDb = db;
  return db;
}

export function nowIso() {
  return new Date().toISOString();
}

export function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}
