import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";

const databasePath = join(tmpdir(), `time-planner-v31-${randomUUID()}.db`);
process.env.DB_PATH = databasePath;

async function main(): Promise<void> {
  const { sqlite } = await import("../src/db");
  const {
    captureItem,
    getInbox,
    getTaskDetail,
    searchContent,
    updateTaskDetail,
  } = await import("../src/lib/capture-search-store");
  const searchRoute = await import("../src/app/api/search/route");
  const captureRoute = await import("../src/app/api/capture/route");
  const inboxRoute = await import("../src/app/api/inbox/route");

  const timestamp = Date.now();
  sqlite
    .prepare(
      `INSERT INTO users (id, username, password_hash, is_admin, created_at)
       VALUES (?, ?, ?, 0, ?)`
    )
    .run("v31-user-a", "v31-a", "test", timestamp);
  sqlite
    .prepare(
      `INSERT INTO users (id, username, password_hash, is_admin, created_at)
       VALUES (?, ?, ?, 0, ?)`
    )
    .run("v31-user-b", "v31-b", "test", timestamp);

  try {
  assert.equal((await searchRoute.GET(new Request("http://localhost/api/search?q=x"))).status, 401);
  assert.equal((await captureRoute.POST(new Request("http://localhost/api/capture", { method: "POST" }))).status, 401);
  assert.equal((await inboxRoute.GET(new Request("http://localhost/api/inbox"))).status, 401);

  const task = captureItem("v31-user-a", {
    kind: "task",
    title: "整理 VPS 部署",
    content: "记录部署步骤",
  });
  const idea = captureItem("v31-user-a", {
    kind: "idea",
    title: "搜索体验",
    content: "全局搜索应该能命中项目笔记",
  });
  const reading = captureItem("v31-user-a", {
    kind: "reading",
    url: "https://example.com/article?utm_source=test",
    title: "一篇文章",
    notes: "稍后阅读",
  });
  assert.equal(task.kind, "task");
  assert.equal(idea.kind, "idea");
  assert.equal(reading.kind, "reading");

  const duplicate = captureItem("v31-user-a", {
    kind: "reading",
    url: "https://example.com/article",
    notes: "更新备注",
  });
  assert.equal(duplicate.existed, true);

  const inbox = getInbox("v31-user-a");
  assert.equal(inbox.total, 3);
  assert.deepEqual(inbox.counts, { all: 3, task: 1, idea: 1, reading: 1 });
  assert.equal(getInbox("v31-user-a", "task").items[0].kind, "task");
  assert.match(getInbox("v31-user-a", "task").items[0].href, /^\/tasks\//);

  const ideaSearch = searchContent("v31-user-a", { query: "项目笔记" });
  assert.equal(ideaSearch.total, 1);
  assert.equal(ideaSearch.items[0].kind, "idea");
  assert.match(ideaSearch.items[0].href, /^\/ideas\?idea=/);

  const taskId = task.item.id;
  sqlite
    .prepare("UPDATE tasks SET due_date = ? WHERE id = ? AND user_id = ?")
    .run("2026-08-30", taskId, "v31-user-a");
  assert.equal(searchContent("v31-user-b", { query: "VPS" }).total, 0);
  assert.equal(getTaskDetail("v31-user-b", taskId), undefined);
  assert.equal(getTaskDetail("v31-user-a", taskId)?.scheduledDate, null);

  const today = updateTaskDetail("v31-user-a", taskId, {
    action: "today",
    date: "2026-08-24",
  });
  assert.equal(today?.scheduledDate, "2026-08-24");
  assert.equal(today?.dueDate, "2026-08-30");
  assert.equal(getInbox("v31-user-a").total, 2);

  const backToWeek = updateTaskDetail("v31-user-a", taskId, { action: "week" });
  assert.equal(backToWeek?.scheduledDate, null);
  assert.equal(backToWeek?.dueDate, "2026-08-30");

  const completed = updateTaskDetail("v31-user-a", taskId, { action: "complete" });
  assert.equal(completed?.done, true);
  const completedAt = completed?.completedAt;
  assert.equal(typeof completedAt, "number");
  const edited = updateTaskDetail("v31-user-a", taskId, { description: "完成后补充说明" });
  assert.equal(edited?.completedAt, completedAt);
  assert.equal(searchContent("v31-user-a", { type: "task", status: "done" }).total, 1);
  const feedback = sqlite
    .prepare(
      "SELECT event_type FROM planning_feedback_events WHERE user_id = ? AND task_id = ? ORDER BY created_at ASC",
    )
    .all("v31-user-a", taskId) as { event_type: string }[];
  assert.deepEqual(feedback.map((item) => item.event_type), ["rescheduled", "rescheduled", "completed"]);

  console.log("PASS V3.1 capture/search/inbox isolation and task detail");
  } finally {
    sqlite.close();
    rmSync(databasePath, { force: true });
    rmSync(`${databasePath}-wal`, { force: true });
    rmSync(`${databasePath}-shm`, { force: true });
  }
}

void main();
