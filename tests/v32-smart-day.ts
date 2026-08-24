import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";

const directory = join(process.cwd(), ".codex-test-data");
mkdirSync(directory, { recursive: true });
const databasePath = join(directory, `v32-${randomUUID()}.db`);
process.env.DB_PATH = databasePath;

async function main(): Promise<void> {
  const { sqlite } = await import("../src/db");
  const {
    confirmSmartDayPlan,
    createDayPlanDraft,
    getSmartDaySettings,
    getSmartDaySnapshot,
    startFocusSession,
    stopFocusSession,
    updateSmartDayItem,
  } = await import("../src/lib/smart-day-store");

const userA = randomUUID();
const userB = randomUUID();
const date = "2026-08-24";
const taskA = randomUUID();
const taskB = randomUUID();
const taskB2 = randomUUID();

function insertUser(id: string, username: string) {
  sqlite
    .prepare("INSERT INTO users (id, username, password_hash, is_admin, created_at) VALUES (?, ?, ?, 0, ?)")
    .run(id, username, "test", Date.now());
}

function insertTask(id: string, userId: string, title: string, estimatedMinutes: number, priority = "P2") {
  sqlite
    .prepare(
      `INSERT INTO tasks
       (id, user_id, title, description, priority, status, due_date, scheduled_date,
        project_id, show_in_week_plan, sort_order, today_sort_order, estimated_minutes,
        energy_level, preferred_period, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, '', ?, 'todo', ?, NULL, NULL, 1, 0, 0, ?, 'high', 'anytime', NULL, ?, ?)`
    )
    .run(id, userId, title, priority, date, estimatedMinutes, Date.now(), Date.now());
}

try {
  insertUser(userA, "v32-a");
  insertUser(userB, "v32-b");
  insertTask(taskA, userA, "用户 A 的高优先级任务", 45, "P1");
  insertTask(taskB, userB, "用户 B 的任务", 30);
  insertTask(taskB2, userB, "用户 B 的第二任务", 30);

  sqlite
    .prepare(
      `INSERT INTO agent_memories
       (id, user_id, category, key, value_json, source, evidence_count, confidence, confirmed,
        last_evidence_at, expires_at, created_at, updated_at)
       VALUES (?, ?, 'explicit', 'daily_capacity_minutes', '90', 'user', 1, 1, 1, ?, NULL, ?, ?)`
    )
    .run(randomUUID(), userA, Date.now(), Date.now(), Date.now());
  sqlite
    .prepare(
      `INSERT INTO agent_memories
       (id, user_id, category, key, value_json, source, evidence_count, confidence, confirmed,
        last_evidence_at, expires_at, created_at, updated_at)
       VALUES (?, ?, 'explicit', 'default_estimated_minutes', '45', 'user', 1, 1, 1, ?, NULL, ?, ?)`
    )
    .run(randomUUID(), userA, Date.now(), Date.now(), Date.now());
  sqlite
    .prepare(
      `INSERT INTO agent_memories
       (id, user_id, category, key, value_json, source, evidence_count, confidence, confirmed,
        last_evidence_at, expires_at, created_at, updated_at)
       VALUES (?, ?, 'behavior', 'estimate_multiplier', '{"multiplier":2}', 'inferred', 1, 0.8, 1, ?, NULL, ?, ?)`
    )
    .run(randomUUID(), userA, Date.now(), Date.now(), Date.now());

  const settings = getSmartDaySettings(userA);
  assert.equal(settings.capacityMinutes, 90);
  assert.equal(settings.memoryOverrides.defaultEstimatedMinutes, 45);
  assert.equal(settings.memoryOverrides.estimateMultiplier, 2);

  const firstDraft = await createDayPlanDraft(userA, date, { useAi: false });
  assert.equal(firstDraft.usedAi, false);
  assert.equal(firstDraft.plan.status, "draft");
  assert.equal(firstDraft.plan.items.length, 1);
  assert.equal(firstDraft.plan.items[0].endMinute - firstDraft.plan.items[0].startMinute, 90);
  assert.equal(firstDraft.unassignedTaskIds.length, 0);

  const item = firstDraft.plan.items[0];
  const accepted = updateSmartDayItem(userA, item.id, { action: "accept" });
  assert.equal(accepted.status, "accepted");
  const confirmed = confirmSmartDayPlan(userA, firstDraft.plan.id);
  assert.equal(confirmed.status, "confirmed");
  assert.equal(
    (sqlite.prepare("SELECT scheduled_date FROM tasks WHERE id = ? AND user_id = ?").get(taskA, userA) as { scheduled_date: string }).scheduled_date,
    date
  );

  const isolated = getSmartDaySnapshot(userB, date);
  assert.equal(isolated.tasks.length, 2);
  assert.ok(isolated.tasks.every((task) => task.id !== taskA));
  assert.throws(() => startFocusSession(userB, { taskId: taskA, date }), /当前用户/);

  for (let index = 0; index < 2; index += 1) {
    const startedAt = Date.now() - (index + 2) * 3600000;
    sqlite
      .prepare(
        `INSERT INTO focus_sessions
         (id, user_id, task_id, plan_item_id, date, started_at, ended_at, duration_seconds, status, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, ?, ?, 2700, 'completed', ?, ?)`
      )
      .run(randomUUID(), userA, taskA, date, startedAt, startedAt + 2700000, startedAt, startedAt + 2700000);
  }
  const focus = startFocusSession(userA, { taskId: taskA, date });
  assert.equal(focus.status, "running");
  sqlite.prepare("UPDATE focus_sessions SET started_at = ? WHERE id = ? AND user_id = ?").run(Date.now() - 2700000, focus.id, userA);
  const stopped = stopFocusSession(userA, focus.id, "stop");
  assert.equal(stopped.status, "completed");
  assert.ok((stopped.durationSeconds ?? 0) >= 0);
  const learned = sqlite
    .prepare("SELECT value_json, evidence_count FROM agent_memories WHERE user_id = ? AND key = 'estimate_multiplier'")
    .get(userA) as { value_json: string; evidence_count: number };
  assert.equal(learned.evidence_count, 3);
  assert.equal((JSON.parse(learned.value_json) as { multiplier: number }).multiplier, 2);

  console.log("PASS V3.2 smart-day store flow");
} finally {
  sqlite.close();
  const cleanupDatabase = new Database(databasePath);
  cleanupDatabase.close();
  rmSync(databasePath, { force: true });
  rmSync(`${databasePath}-wal`, { force: true });
  rmSync(`${databasePath}-shm`, { force: true });
}
}

void main();
