import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { migrateDatabase } from "../src/db/migrations.ts";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const usernameIndex = args.indexOf("--username");
const username = usernameIndex >= 0 ? args[usernameIndex + 1] : "";

if (apply && !username) {
  console.error("--apply 必须同时提供 --username <existing-user>");
  process.exit(2);
}

const dbPath = process.env.DB_PATH || "time-planner.db";
mkdirSync(dirname(dbPath), { recursive: true });
const sqlite = new Database(dbPath);
sqlite.pragma("foreign_keys = ON");
migrateDatabase(sqlite);

const owner = username
  ? sqlite.prepare("SELECT id, username FROM users WHERE username = ?").get(username)
  : undefined;
if (apply && !owner) {
  console.error("指定 username 不存在；未写入任何认领数据");
  sqlite.close();
  process.exit(3);
}

const tables = [
  "projects",
  "project_groups",
  "tasks",
  "habits",
  "habit_logs",
  "ideas",
  "reading_items",
  "app_settings",
  "recurring_tasks",
  "hermes_api_tokens",
  "hermes_legacy_tokens",
];
const counts = tables.map((table) => ({
  table,
  count: sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE user_id = ''`).get().count,
}));
const total = counts.reduce((sum, row) => sum + row.count, 0);

console.log(`mode=${apply ? "apply" : "dry-run"}`);
console.log(`legacy_rows=${total}`);
for (const row of counts) console.log(`${row.table}=${row.count}`);

if (apply && owner) {
  const claim = sqlite.transaction(() => {
    for (const table of tables.filter((name) => name !== "hermes_api_tokens")) {
      sqlite.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id = ''`).run(owner.id);
    }
    sqlite.prepare(`INSERT OR IGNORE INTO hermes_api_tokens
      (id, user_id, token_hash, token_last4, created_at, rotated_at, revoked_at)
      SELECT id, user_id, token_hash, token_last4, created_at, NULL, NULL
      FROM hermes_legacy_tokens WHERE user_id = ?`).run(owner.id);
    sqlite.prepare("DELETE FROM hermes_legacy_tokens WHERE user_id = ?").run(owner.id);
  });
  claim();
  console.log(`claimed_username=${owner.username}`);
}

sqlite.close();
