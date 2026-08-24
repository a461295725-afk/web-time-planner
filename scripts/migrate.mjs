import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { migrateDatabase, migrationVersion } from "../src/db/migrations.ts";

const dbPath = process.env.DB_PATH || "time-planner.db";
mkdirSync(dirname(dbPath), { recursive: true });
const sqlite = new Database(dbPath);
sqlite.pragma("busy_timeout = 10000");
sqlite.pragma("foreign_keys = ON");
migrateDatabase(sqlite);
sqlite.pragma("journal_mode = WAL");
sqlite.close();
console.log(`DB migration complete (version ${migrationVersion()})`);
