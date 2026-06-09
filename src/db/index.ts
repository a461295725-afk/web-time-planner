import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const DB_PATH = process.env.DB_PATH || "time-planner.db";
mkdirSync(dirname(DB_PATH), { recursive: true });
const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    token TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL DEFAULT '', name TEXT NOT NULL, description TEXT, due_date TEXT,
    show_in_week_plan INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, description TEXT,
    priority TEXT NOT NULL DEFAULT 'P2', status TEXT NOT NULL DEFAULT 'todo',
    due_date TEXT, scheduled_date TEXT, project_id TEXT REFERENCES projects(id),
    show_in_week_plan INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0,
    today_sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS habits (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL DEFAULT '', name TEXT NOT NULL, icon TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS habit_logs (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL DEFAULT '', habit_id TEXT NOT NULL REFERENCES habits(id),
    date TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ideas (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS reading_items (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL DEFAULT '', url TEXT NOT NULL, normalized_url TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', is_read INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'manual', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY, user_id TEXT NOT NULL DEFAULT '', value TEXT NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS recurring_tasks (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL, day_of_month INTEGER NOT NULL,
    priority TEXT NOT NULL DEFAULT 'P2',
    created_at INTEGER NOT NULL
  );
`);

function addColumn(table: string, column: string, definition: string) {
  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  if (!columns.some((item) => item.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

addColumn("projects", "due_date", "TEXT");
addColumn("projects", "show_in_week_plan", "INTEGER NOT NULL DEFAULT 0");
addColumn("tasks", "scheduled_date", "TEXT");
addColumn("tasks", "show_in_week_plan", "INTEGER NOT NULL DEFAULT 0");
addColumn("tasks", "sort_order", "INTEGER NOT NULL DEFAULT 0");
addColumn("tasks", "today_sort_order", "INTEGER NOT NULL DEFAULT 0");

const tablesWithUser = [
  "projects",
  "tasks",
  "habits",
  "habit_logs",
  "ideas",
  "reading_items",
  "recurring_tasks",
];
for (const t of tablesWithUser) {
  addColumn(t, "user_id", "TEXT NOT NULL DEFAULT ''");
}

// Migrate app_settings: old PK was `key`, new PK is `id` with UNIQUE(user_id, key)
const appCols = sqlite
  .prepare("PRAGMA table_info(app_settings)")
  .all() as { name: string }[];
if (!appCols.some((c) => c.name === "id")) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS app_settings_new (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_app_settings_user_key ON app_settings_new(user_id, key);
  `);
  const oldRows = sqlite
    .prepare("SELECT key, value, updated_at FROM app_settings")
    .all() as { key: string; value: string; updated_at: number }[];
  const insert = sqlite.prepare(
    "INSERT INTO app_settings_new (id, user_id, key, value, updated_at) VALUES (?, '', ?, ?, ?)"
  );
  for (const row of oldRows) {
    insert.run(randomUUID(), row.key, row.value, row.updated_at);
  }
  sqlite.exec("DROP TABLE app_settings; ALTER TABLE app_settings_new RENAME TO app_settings;");
}

export const db = drizzle(sqlite, { schema });
export { sqlite };
export { schema };
