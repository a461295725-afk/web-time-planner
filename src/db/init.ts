import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { migrateDatabase, migrationVersion } from "./migrations";

const DB_PATH = process.env.DB_PATH || "time-planner.db";
mkdirSync(dirname(DB_PATH), { recursive: true });
const sqlite = new Database(DB_PATH);
sqlite.pragma("busy_timeout = 10000");
sqlite.pragma("foreign_keys = ON");
migrateDatabase(sqlite);
sqlite.pragma("journal_mode = WAL");
sqlite.close();
console.log(`数据库初始化完成（迁移版本 ${migrationVersion()}）`);
