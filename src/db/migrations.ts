import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { hashHermesToken, hermesTokenLast4 } from "@/lib/hermes-token";

type SqliteDatabase = Database.Database;

const CURRENT_VERSION = 7;

function tableColumns(sqlite: SqliteDatabase, table: string): string[] {
  return (sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
    (column) => column.name
  );
}

function addColumn(
  sqlite: SqliteDatabase,
  table: string,
  column: string,
  definition: string
): void {
  if (!tableColumns(sqlite, table).includes(column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function uniqueIndexes(
  sqlite: SqliteDatabase,
  table: string
): { name: string; columns: string[] }[] {
  const indexes = sqlite
    .prepare(`PRAGMA index_list(${table})`)
    .all() as { name: string; unique: number }[];
  return indexes
    .filter((index) => Boolean(index.unique))
    .map((index) => ({
      name: index.name,
      columns: (
        sqlite.prepare(`PRAGMA index_info(${JSON.stringify(index.name)})`).all() as {
          name: string;
          seqno: number;
        }[]
      )
        .sort((a, b) => a.seqno - b.seqno)
        .map((column) => column.name),
    }));
}

function hasUniqueIndex(
  sqlite: SqliteDatabase,
  table: string,
  columns: string[]
): boolean {
  return uniqueIndexes(sqlite, table).some(
    (index) =>
      index.columns.length === columns.length &&
      index.columns.every((column, indexPosition) => column === columns[indexPosition])
  );
}

function createBaseTables(sqlite: SqliteDatabase): void {
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
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      description TEXT,
      due_date TEXT,
      show_in_week_plan INTEGER NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0,
      group_name TEXT,
      project_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS project_groups (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(user_id, name)
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT NOT NULL DEFAULT 'P2' CHECK(priority IN ('P1', 'P2', 'P3')),
      status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo', 'done', 'overdue')),
      due_date TEXT,
      scheduled_date TEXT,
      project_id TEXT REFERENCES projects(id),
      show_in_week_plan INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      today_sort_order INTEGER NOT NULL DEFAULT 0,
      estimated_minutes INTEGER,
      energy_level TEXT,
      preferred_period TEXT,
      completed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS habits (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS habit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      habit_id TEXT NOT NULL REFERENCES habits(id),
      date TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ideas (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reading_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL,
      normalized_url TEXT NOT NULL,
      title TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      is_read INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(user_id, normalized_url)
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(user_id, key)
    );
    CREATE TABLE IF NOT EXISTS recurring_tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      day_of_month INTEGER NOT NULL,
      priority TEXT NOT NULL DEFAULT 'P2' CHECK(priority IN ('P1', 'P2', 'P3')),
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS hermes_api_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL UNIQUE,
      token_last4 TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      rotated_at INTEGER,
      revoked_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS hermes_legacy_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      token_hash TEXT NOT NULL UNIQUE,
      token_last4 TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS day_plans (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'confirmed', 'rejected')),
      source TEXT NOT NULL DEFAULT 'rules' CHECK(source IN ('rules', 'ai', 'manual')),
      version INTEGER NOT NULL DEFAULT 1,
      summary TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      confirmed_at INTEGER,
      UNIQUE(user_id, date)
    );
    CREATE TABLE IF NOT EXISTS day_plan_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      plan_id TEXT NOT NULL REFERENCES day_plans(id) ON DELETE CASCADE,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed', 'accepted', 'rejected')),
      block TEXT NOT NULL CHECK(block IN ('morning', 'afternoon', 'evening')),
      start_minute INTEGER NOT NULL,
      end_minute INTEGER NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      reason TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(plan_id, task_id)
    );
    CREATE TABLE IF NOT EXISTS focus_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      plan_item_id TEXT REFERENCES day_plan_items(id) ON DELETE SET NULL,
      date TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      duration_seconds INTEGER,
      status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'cancelled')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS planning_feedback_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      plan_id TEXT,
      task_id TEXT,
      date TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      period_type TEXT NOT NULL CHECK(period_type IN ('daily', 'weekly')),
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      wins TEXT NOT NULL DEFAULT '',
      blockers TEXT NOT NULL DEFAULT '',
      next_action TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      metrics_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(user_id, period_type, period_start)
    );
    CREATE TABLE IF NOT EXISTS task_carryovers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      task_id TEXT NOT NULL,
      source_date TEXT NOT NULL,
      target_date TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('move_next_day', 'return_to_week')),
      created_at INTEGER NOT NULL,
      UNIQUE(user_id, task_id, source_date, target_date)
    );
    CREATE TABLE IF NOT EXISTS agent_memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      category TEXT NOT NULL CHECK(category IN ('explicit', 'preference', 'behavior', 'context')),
      key TEXT NOT NULL,
      value_json TEXT NOT NULL,
      source TEXT NOT NULL CHECK(source IN ('user', 'inferred', 'system')),
      evidence_count INTEGER NOT NULL DEFAULT 1,
      confidence REAL NOT NULL DEFAULT 1,
      confirmed INTEGER NOT NULL DEFAULT 0,
      last_evidence_at INTEGER NOT NULL,
      expires_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(user_id, category, key)
    );
  `);
}

function ensureLegacyColumns(sqlite: SqliteDatabase): void {
  const columnDefinitions: Record<string, [string, string][]> = {
    projects: [
      ["user_id", "TEXT NOT NULL DEFAULT ''"], ["due_date", "TEXT"],
      ["show_in_week_plan", "INTEGER NOT NULL DEFAULT 0"], ["pinned", "INTEGER NOT NULL DEFAULT 0"],
      ["group_name", "TEXT"], ["project_order", "INTEGER NOT NULL DEFAULT 0"],
      ["created_at", "INTEGER NOT NULL DEFAULT 0"], ["updated_at", "INTEGER NOT NULL DEFAULT 0"],
    ],
    project_groups: [["user_id", "TEXT NOT NULL DEFAULT ''"], ["sort_order", "INTEGER NOT NULL DEFAULT 0"], ["created_at", "INTEGER NOT NULL DEFAULT 0"], ["updated_at", "INTEGER NOT NULL DEFAULT 0"]],
    tasks: [
      ["user_id", "TEXT NOT NULL DEFAULT ''"], ["description", "TEXT"], ["priority", "TEXT NOT NULL DEFAULT 'P2'"],
      ["status", "TEXT NOT NULL DEFAULT 'todo'"], ["due_date", "TEXT"], ["scheduled_date", "TEXT"], ["project_id", "TEXT"],
      ["show_in_week_plan", "INTEGER NOT NULL DEFAULT 0"], ["sort_order", "INTEGER NOT NULL DEFAULT 0"],
      ["today_sort_order", "INTEGER NOT NULL DEFAULT 0"], ["created_at", "INTEGER NOT NULL DEFAULT 0"], ["updated_at", "INTEGER NOT NULL DEFAULT 0"],
    ],
    habits: [["user_id", "TEXT NOT NULL DEFAULT ''"], ["created_at", "INTEGER NOT NULL DEFAULT 0"]],
    habit_logs: [["user_id", "TEXT NOT NULL DEFAULT ''"], ["created_at", "INTEGER NOT NULL DEFAULT 0"]],
    ideas: [["user_id", "TEXT NOT NULL DEFAULT ''"], ["content", "TEXT NOT NULL DEFAULT ''"], ["created_at", "INTEGER NOT NULL DEFAULT 0"], ["updated_at", "INTEGER NOT NULL DEFAULT 0"]],
    reading_items: [["user_id", "TEXT NOT NULL DEFAULT ''"], ["normalized_url", "TEXT NOT NULL DEFAULT ''"], ["notes", "TEXT NOT NULL DEFAULT ''"], ["is_read", "INTEGER NOT NULL DEFAULT 0"], ["source", "TEXT NOT NULL DEFAULT 'manual'"], ["created_at", "INTEGER NOT NULL DEFAULT 0"], ["updated_at", "INTEGER NOT NULL DEFAULT 0"]],
    app_settings: [["user_id", "TEXT NOT NULL DEFAULT ''"], ["value", "TEXT NOT NULL DEFAULT ''"], ["updated_at", "INTEGER NOT NULL DEFAULT 0"]],
    recurring_tasks: [["user_id", "TEXT NOT NULL DEFAULT ''"], ["priority", "TEXT NOT NULL DEFAULT 'P2'"], ["created_at", "INTEGER NOT NULL DEFAULT 0"]],
  };
  for (const [table, columns] of Object.entries(columnDefinitions)) {
    for (const [column, definition] of columns) addColumn(sqlite, table, column, definition);
  }
  sqlite.exec(`
    UPDATE tasks SET scheduled_date = due_date
    WHERE (scheduled_date IS NULL OR trim(scheduled_date) = '') AND due_date IS NOT NULL AND trim(due_date) <> '';
    UPDATE tasks SET due_date = scheduled_date WHERE scheduled_date IS NOT NULL;
  `);
}

function rebuildReadingItems(sqlite: SqliteDatabase): void {
  const hasComposite = hasUniqueIndex(sqlite, "reading_items", ["user_id", "normalized_url"]);
  const hasGlobal = hasUniqueIndex(sqlite, "reading_items", ["normalized_url"]);
  if (hasComposite && !hasGlobal) return;
  sqlite.exec(`
    CREATE TABLE reading_items_new (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL DEFAULT '', url TEXT NOT NULL,
      normalized_url TEXT NOT NULL, title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
      is_read INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'manual',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(user_id, normalized_url)
    );
    INSERT INTO reading_items_new
      (id, user_id, url, normalized_url, title, notes, is_read, source, created_at, updated_at)
    SELECT id, user_id, url, normalized_url, title, notes, is_read, source, created_at, updated_at FROM reading_items;
    DROP TABLE reading_items;
    ALTER TABLE reading_items_new RENAME TO reading_items;
  `);
}

function rebuildAppSettings(sqlite: SqliteDatabase): void {
  const columns = tableColumns(sqlite, "app_settings");
  const hasId = columns.includes("id");
  const hasComposite = hasUniqueIndex(sqlite, "app_settings", ["user_id", "key"]);
  if (hasId && hasComposite) return;
  sqlite.exec(`
    CREATE TABLE app_settings_new (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL DEFAULT '', key TEXT NOT NULL,
      value TEXT NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(user_id, key)
    );
  `);
  const idSelect = hasId ? "id" : "NULL AS id";
  const oldRows = sqlite
    .prepare(`SELECT user_id, key, value, updated_at, ${idSelect} FROM app_settings`)
    .all() as { user_id: string; key: string; value: string; updated_at: number; id?: string }[];
  const insert = sqlite.prepare("INSERT INTO app_settings_new (id, user_id, key, value, updated_at) VALUES (?, ?, ?, ?, ?)");
  for (const row of oldRows) insert.run(row.id || randomUUID(), row.user_id || "", row.key, row.value, row.updated_at);
  sqlite.exec("DROP TABLE app_settings; ALTER TABLE app_settings_new RENAME TO app_settings;");
}

function createIndexes(sqlite: SqliteDatabase): void {
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_user_scheduled_date ON tasks(user_id, scheduled_date);
    CREATE INDEX IF NOT EXISTS idx_tasks_user_project ON tasks(user_id, project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_user_week ON tasks(user_id, show_in_week_plan);
    CREATE INDEX IF NOT EXISTS idx_projects_user_order ON projects(user_id, pinned, project_order);
    CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id);
    CREATE INDEX IF NOT EXISTS idx_habit_logs_user_date ON habit_logs(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_ideas_user_updated ON ideas(user_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_recurring_tasks_user_day ON recurring_tasks(user_id, day_of_month);
    CREATE INDEX IF NOT EXISTS idx_hermes_tokens_user_active ON hermes_api_tokens(user_id, revoked_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_app_settings_user_key ON app_settings(user_id, key);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_reading_items_user_normalized_url ON reading_items(user_id, normalized_url);
  `);
}

function migrateLegacyHermesTokens(sqlite: SqliteDatabase): void {
  const rows = sqlite
    .prepare("SELECT id, user_id, value, updated_at FROM app_settings WHERE key = 'hermesApiToken' AND trim(value) <> ''")
    .all() as { id: string; user_id: string; value: string; updated_at: number }[];
  const insertActive = sqlite.prepare(`INSERT OR IGNORE INTO hermes_api_tokens
    (id, user_id, token_hash, token_last4, created_at, rotated_at, revoked_at)
    VALUES (?, ?, ?, ?, ?, NULL, NULL)`);
  const insertPending = sqlite.prepare(`INSERT OR IGNORE INTO hermes_legacy_tokens
    (id, user_id, token_hash, token_last4, created_at) VALUES (?, ?, ?, ?, ?)`);
  for (const row of rows) {
    const hasOwner = Boolean(
      row.user_id && sqlite.prepare("SELECT 1 FROM users WHERE id = ?").get(row.user_id)
    );
    const hash = hashHermesToken(row.value);
    if (hasOwner) {
      insertActive.run(randomUUID(), row.user_id, hash, hermesTokenLast4(row.value), row.updated_at || Date.now());
    } else {
      insertPending.run(randomUUID(), row.user_id || "", hash, hermesTokenLast4(row.value), row.updated_at || Date.now());
    }
  }
  if (rows.length > 0) sqlite.prepare("DELETE FROM app_settings WHERE key = 'hermesApiToken'").run();
}

function ensureLegacyHermesTable(sqlite: SqliteDatabase): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS hermes_legacy_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      token_hash TEXT NOT NULL UNIQUE,
      token_last4 TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_hermes_legacy_tokens_user ON hermes_legacy_tokens(user_id);
  `);
  migrateLegacyHermesTokens(sqlite);
}

function createV3PlanningTables(sqlite: SqliteDatabase): void {
  addColumn(sqlite, "tasks", "estimated_minutes", "INTEGER");
  addColumn(sqlite, "tasks", "energy_level", "TEXT");
  addColumn(sqlite, "tasks", "preferred_period", "TEXT");
  addColumn(sqlite, "tasks", "completed_at", "INTEGER");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS day_plans (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'confirmed', 'rejected')),
      source TEXT NOT NULL DEFAULT 'rules' CHECK(source IN ('rules', 'ai', 'manual')),
      version INTEGER NOT NULL DEFAULT 1,
      summary TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      confirmed_at INTEGER,
      UNIQUE(user_id, date)
    );
    CREATE TABLE IF NOT EXISTS day_plan_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      plan_id TEXT NOT NULL REFERENCES day_plans(id) ON DELETE CASCADE,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed', 'accepted', 'rejected')),
      block TEXT NOT NULL CHECK(block IN ('morning', 'afternoon', 'evening')),
      start_minute INTEGER NOT NULL,
      end_minute INTEGER NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      reason TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(plan_id, task_id)
    );
    CREATE TABLE IF NOT EXISTS focus_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      plan_item_id TEXT REFERENCES day_plan_items(id) ON DELETE SET NULL,
      date TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      duration_seconds INTEGER,
      status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'cancelled')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS planning_feedback_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      plan_id TEXT,
      task_id TEXT,
      date TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      period_type TEXT NOT NULL CHECK(period_type IN ('daily', 'weekly')),
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      wins TEXT NOT NULL DEFAULT '',
      blockers TEXT NOT NULL DEFAULT '',
      next_action TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      metrics_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(user_id, period_type, period_start)
    );
    CREATE TABLE IF NOT EXISTS task_carryovers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      task_id TEXT NOT NULL,
      source_date TEXT NOT NULL,
      target_date TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('move_next_day', 'return_to_week')),
      created_at INTEGER NOT NULL,
      UNIQUE(user_id, task_id, source_date, target_date)
    );
    CREATE TABLE IF NOT EXISTS agent_memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      category TEXT NOT NULL CHECK(category IN ('explicit', 'preference', 'behavior', 'context')),
      key TEXT NOT NULL,
      value_json TEXT NOT NULL,
      source TEXT NOT NULL CHECK(source IN ('user', 'inferred', 'system')),
      evidence_count INTEGER NOT NULL DEFAULT 1,
      confidence REAL NOT NULL DEFAULT 1,
      confirmed INTEGER NOT NULL DEFAULT 0,
      last_evidence_at INTEGER NOT NULL,
      expires_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(user_id, category, key)
    );
    CREATE INDEX IF NOT EXISTS idx_day_plans_user_date ON day_plans(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_day_plan_items_plan_position ON day_plan_items(plan_id, position);
    CREATE INDEX IF NOT EXISTS idx_focus_sessions_user_date ON focus_sessions(user_id, date);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_focus_sessions_one_running
      ON focus_sessions(user_id) WHERE status = 'running';
    CREATE INDEX IF NOT EXISTS idx_feedback_user_date ON planning_feedback_events(user_id, date, created_at);
    CREATE INDEX IF NOT EXISTS idx_reviews_user_period ON reviews(user_id, period_type, period_start);
    CREATE INDEX IF NOT EXISTS idx_carryovers_user_source ON task_carryovers(user_id, source_date);
    CREATE INDEX IF NOT EXISTS idx_agent_memories_user_active ON agent_memories(user_id, category, expires_at);
  `);
}

function applyMigration(sqlite: SqliteDatabase, version: number): void {
  switch (version) {
    case 1: createBaseTables(sqlite); break;
    case 2: ensureLegacyColumns(sqlite); break;
    case 3: rebuildAppSettings(sqlite); rebuildReadingItems(sqlite); break;
    case 4: createIndexes(sqlite); break;
    case 5: migrateLegacyHermesTokens(sqlite); break;
    case 6: ensureLegacyHermesTable(sqlite); break;
    case 7: createV3PlanningTables(sqlite); break;
    default: throw new Error(`未知数据库迁移版本：${version}`);
  }
}

export function migrateDatabase(sqlite: SqliteDatabase): void {
  sqlite.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)");
  const applied = new Set((sqlite.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as { version: number }[]).map((row) => row.version));
  for (let version = 1; version <= CURRENT_VERSION; version += 1) {
    if (applied.has(version)) continue;
    sqlite.transaction(() => {
      applyMigration(sqlite, version);
      sqlite.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(version, Date.now());
    })();
  }
}

export function migrationVersion(): number {
  return CURRENT_VERSION;
}
