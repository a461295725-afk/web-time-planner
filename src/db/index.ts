import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrateDatabase } from "./migrations";
import * as schema from "./schema";

const DB_PATH = process.env.DB_PATH || "time-planner.db";
mkdirSync(dirname(DB_PATH), { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma("busy_timeout = 10000");
sqlite.pragma("foreign_keys = ON");
migrateDatabase(sqlite);
try {
  sqlite.pragma("journal_mode = WAL");
} catch (error) {
  if (!(error instanceof Error) || !("code" in error) || error.code !== "SQLITE_BUSY") throw error;
}

export const db = drizzle(sqlite, { schema });
export { sqlite };
export { schema };
