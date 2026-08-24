import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const directory = join(process.cwd(), ".codex-test-data");
mkdirSync(directory, { recursive: true });
const dbPath = join(directory, `v33-review-${randomUUID()}.db`);
process.env.DB_PATH = dbPath;

async function main(): Promise<void> {
const { migrateDatabase } = await import("../src/db/migrations");
const { sqlite } = await import("../src/db");
const { applyCarryover, getReviewStats, getStalledProjects, saveReview } = await import("../src/lib/review-store");
const { confirmMemory, getMemories, observeMemories, upsertMemory } = await import("../src/lib/memory-store");
const { canonicalExportJson, createUserExport } = await import("../src/lib/export-store");

function insertUser(id: string, username: string): void {
  sqlite
    .prepare(
      "INSERT INTO users (id, username, password_hash, is_admin, created_at) VALUES (?, ?, ?, 0, ?)"
    )
    .run(id, username, "not-used-in-test", Date.now());
}

try {
  migrateDatabase(sqlite);
  const userA = randomUUID();
  const userB = randomUUID();
  insertUser(userA, "v33-a");
  insertUser(userB, "v33-b");

  const source = "2026-08-23";
  const target = "2026-08-24";
  const projectId = randomUUID();
  sqlite
    .prepare(
      `INSERT INTO projects (id, user_id, name, description, due_date, show_in_week_plan, pinned, group_name,
        project_order, created_at, updated_at)
       VALUES (?, ?, ?, '', NULL, 1, 0, NULL, 0, ?, ?)`
    )
    .run(projectId, userA, "停滞测试项目", Date.now() - 12 * 86400000, Date.now() - 12 * 86400000);
  const p1Id = randomUUID();
  const p1WithoutDueDateId = randomUUID();
  const p2Id = randomUUID();
  const doneId = randomUUID();
  const estimateId = randomUUID();
  const old = Date.now() - 12 * 86400000;
  const insertTask = sqlite.prepare(
    `INSERT INTO tasks
      (id, user_id, title, description, priority, status, due_date, scheduled_date, project_id,
       show_in_week_plan, sort_order, today_sort_order, estimated_minutes, energy_level,
       preferred_period, completed_at, created_at, updated_at)
     VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?, 0, 0, ?, NULL, NULL, ?, ?, ?)`
  );
  insertTask.run(p1Id, userA, "P1 结转", "P1", "todo", source, source, projectId, 0, null, old, old, old);
  insertTask.run(p1WithoutDueDateId, userA, "无截止日 P1 结转", "P1", "todo", null, source, projectId, 0, null, old, old, old);
  insertTask.run(p2Id, userA, "P2 退回", "P2", "todo", source, source, projectId, 0, null, old, old, old);
  insertTask.run(doneId, userA, "已完成", "P2", "done", source, source, projectId, 0, null, old, old, old);
  insertTask.run(estimateId, userB, "另一用户任务", "P2", "todo", source, source, null, 0, 30, null, old, old);

  const statsA = getReviewStats(userA, source, target);
  assert.equal(statsA.days[0].plannedCount, 4);
  assert.equal(statsA.days[0].plannedDoneCount, 1);
  assert.equal(getReviewStats(userB, source, target).days[0].plannedCount, 1);
  assert.equal(getStalledProjects(userA, target, 7).length, 1);
  assert.equal(getStalledProjects(userB, target, 7).length, 0);

  const saved = saveReview(userA, {
    periodType: "daily",
    periodStart: source,
    wins: "完成测试",
    blockers: "无",
    nextAction: "继续",
    notes: "幂等",
  });
  assert.equal(saved.periodStart, source);
  assert.equal(saveReview(userA, { periodType: "daily", periodStart: source, wins: "更新" }).id, saved.id);

  const firstCarryover = applyCarryover(userA, source, target);
  assert.equal(firstCarryover.moved.length, 2);
  assert.equal(firstCarryover.returnedToWeek.length, 1);
  const secondCarryover = applyCarryover(userA, source, target);
  assert.equal(secondCarryover.moved.length, 0);
  assert.equal(secondCarryover.returnedToWeek.length, 0);
  assert.equal(secondCarryover.skipped.length, 0);
  const p1 = sqlite.prepare("SELECT scheduled_date, due_date FROM tasks WHERE id = ? AND user_id = ?").get(p1Id, userA) as { scheduled_date: string; due_date: string };
  const p1WithoutDueDate = sqlite.prepare("SELECT scheduled_date, due_date FROM tasks WHERE id = ? AND user_id = ?").get(p1WithoutDueDateId, userA) as { scheduled_date: string; due_date: string | null };
  const p2 = sqlite.prepare("SELECT scheduled_date, due_date, show_in_week_plan FROM tasks WHERE id = ? AND user_id = ?").get(p2Id, userA) as { scheduled_date: string | null; due_date: string; show_in_week_plan: number };
  assert.equal(p1.scheduled_date, target);
  assert.equal(p1.due_date, source);
  assert.equal(p1WithoutDueDate.scheduled_date, target);
  assert.equal(p1WithoutDueDate.due_date, null);
  assert.equal(p2.scheduled_date, null);
  assert.equal(p2.due_date, source);
  assert.equal(p2.show_in_week_plan, 1);

  const memory = upsertMemory(userA, { category: "explicit", key: "work_window", value: { start: "09:00" } });
  assert.equal(getMemories(userB).length, 0);
  assert.equal(confirmMemory(userA, memory.id)?.confirmed, true);

  for (let index = 0; index < 5; index += 1) {
    const taskId = randomUUID();
    insertTask.run(taskId, userA, `专注 ${index}`, "P2", "todo", target, target, null, 0, 30, null, Date.now(), Date.now());
    sqlite
      .prepare(
        `INSERT INTO focus_sessions
          (id, user_id, task_id, plan_item_id, date, started_at, ended_at, duration_seconds, status, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 'completed', ?, ?)`
      )
      .run(randomUUID(), userA, taskId, target, Date.now(), Date.now(), 1800, Date.now(), Date.now());
  }
  const confirmedObservation = upsertMemory(userA, {
    category: "behavior",
    key: "estimate_multiplier",
    value: { multiplier: 9 },
  });
  assert.equal(confirmMemory(userA, confirmedObservation.id)?.confirmed, true);
  const observed = observeMemories(userA);
  assert(observed.candidates.some((candidate) => candidate.key === "preferred_focus_period"));
  assert.equal(
    (getMemories(userA).find((item) => item.key === "estimate_multiplier")?.value as { multiplier: number }).multiplier,
    9,
  );
  const fakeToken = ["sk", "A".repeat(32)].join("-");
  assert.throws(() => upsertMemory(userA, { category: "context", key: "safe_note", value: { token: "secret" } }));
  assert.throws(() => upsertMemory(userA, { category: "context", key: "safe_text", value: `备注 ${fakeToken}` }));
  assert.equal(getMemories(userB).length, 0);

  sqlite.prepare("INSERT INTO app_settings (id, user_id, key, value, updated_at) VALUES (?, ?, 'hermesApiToken', 'secret-token', ?)").run(randomUUID(), userA, Date.now());
  sqlite.prepare("INSERT INTO app_settings (id, user_id, key, value, updated_at) VALUES (?, ?, 'aiModel', ?, ?)").run(randomUUID(), userA, `model ${fakeToken}`, Date.now());
  const exportA = createUserExport(userA, "v33-a");
  const { sha256, ...withoutHash } = exportA;
  const { createHash } = await import("node:crypto");
  const recomputed = createHash("sha256").update(canonicalExportJson(withoutHash), "utf8").digest("hex");
  assert.equal(sha256, recomputed);
  assert.equal(JSON.stringify(exportA).includes("secret-token"), false);
  assert.equal(JSON.stringify(exportA).includes(fakeToken), false);
  assert.equal(JSON.stringify(exportA).includes("另一用户任务"), false);

  console.log("PASS V3.3 review/carryover/stats/memory/export isolation");
} finally {
  sqlite.close();
  rmSync(dbPath, { force: true });
  rmSync(`${dbPath}-wal`, { force: true });
  rmSync(`${dbPath}-shm`, { force: true });
}
}

void main();
