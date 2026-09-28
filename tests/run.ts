import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { migrateDatabase, migrationVersion } from "../src/db/migrations";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const tests: TestCase[] = [
  {
    name: "V3 migration creates the planning contract and is repeatable",
    run: () => {
      const directory = join(process.cwd(), ".codex-test-data");
      mkdirSync(directory, { recursive: true });
      const path = join(directory, `${randomUUID()}.db`);
      const database = new Database(path);
      try {
        database.pragma("foreign_keys = ON");
        migrateDatabase(database);
        migrateDatabase(database);

        const taskColumns = new Set(
          (database.prepare("PRAGMA table_info(tasks)").all() as { name: string }[]).map(
            (column) => column.name
          )
        );
        for (const column of [
          "estimated_minutes",
          "energy_level",
          "preferred_period",
          "completed_at",
          "execution_state",
          "next_action",
          "done_definition",
          "waiting_on",
          "follow_up_date",
          "blocker",
          "task_level",
          "parent_task_id",
          "origin_source",
          "origin_ref",
          "completion_outcome",
          "last_outcome_at",
        ]) {
          assert(taskColumns.has(column), `tasks.${column} should exist`);
        }

        const tables = new Set(
          (
            database
              .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
              .all() as { name: string }[]
          ).map((row) => row.name)
        );
        for (const table of [
          "day_plans",
          "day_plan_items",
          "focus_sessions",
          "planning_feedback_events",
          "reviews",
          "task_carryovers",
          "agent_memories",
          "assistant_api_tokens",
          "assistant_idempotency",
          "assistant_audit_events",
          "task_outcomes",
          "workflow_templates",
        ]) {
          assert(tables.has(table), `${table} should exist`);
        }
        assert.equal(migrationVersion(), 9);
      } finally {
        database.close();
        rmSync(path, { force: true });
        rmSync(`${path}-wal`, { force: true });
        rmSync(`${path}-shm`, { force: true });
      }
    },
  },
];

async function main(): Promise<void> {
  let failed = 0;
  for (const test of tests) {
    try {
      await test.run();
      console.log(`PASS ${test.name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${test.name}`);
      console.error(error);
    }
  }
  console.log(`passed=${tests.length - failed} failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

void main();
