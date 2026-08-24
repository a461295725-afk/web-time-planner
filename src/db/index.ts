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
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
migrateDatabase(sqlite);

export const db = drizzle(sqlite, { schema });
export { sqlite };
export { schema };
