import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

function request(
  url: string,
  cookie?: string,
  method = "GET",
  body?: unknown
): Request {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function json<T>(response: Response): Promise<T> {
  const value = (await response.json()) as T;
  assert(response.ok, JSON.stringify(value));
  return value;
}

async function main(): Promise<void> {
  const directory = join(process.cwd(), ".codex-integration-data");
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${randomUUID()}.db`);
  process.env.DB_PATH = path;

  const { sqlite } = await import("../src/db");
  const { createSession } = await import("../src/lib/auth");
  const { canonicalExportJson } = await import("../src/lib/export-store");
  const captureRoute = await import("../src/app/api/capture/route");
  const inboxRoute = await import("../src/app/api/inbox/route");
  const searchRoute = await import("../src/app/api/search/route");
  const taskRoute = await import("../src/app/api/tasks/route");
  const draftRoute = await import("../src/app/api/smart-day/drafts/route");
  const itemRoute = await import("../src/app/api/smart-day/items/[id]/route");
  const confirmRoute = await import("../src/app/api/smart-day/plans/[id]/confirm/route");
  const smartDayRoute = await import("../src/app/api/smart-day/route");
  const focusRoute = await import("../src/app/api/focus-sessions/route");
  const focusItemRoute = await import("../src/app/api/focus-sessions/[id]/route");
  const reviewRoute = await import("../src/app/api/reviews/route");
  const carryoverRoute = await import("../src/app/api/reviews/carryover/route");
  const memoryRoute = await import("../src/app/api/agent/memory/route");
  const exportRoute = await import("../src/app/api/export/route");

  try {
    const createdAt = Date.now();
    sqlite
      .prepare(
        "INSERT INTO users (id, username, password_hash, is_admin, created_at) VALUES (?, ?, ?, 1, ?)"
      )
      .run("user-a", "integration-a", "test-only-hash-a", createdAt);
    sqlite
      .prepare(
        "INSERT INTO users (id, username, password_hash, is_admin, created_at) VALUES (?, ?, ?, 0, ?)"
      )
      .run("user-b", "integration-b", "test-only-hash-b", createdAt);
    const cookieA = `wtp_session=${createSession("user-a").token}`;
    const cookieB = `wtp_session=${createSession("user-b").token}`;

    const unauthorized = await searchRoute.GET(request("http://local/api/search?q=秘密"));
    assert.equal(unauthorized.status, 401);

    const captured = await json<{ item: { id: string; title: string } }>(
      await captureRoute.POST(
        request("http://local/api/capture", cookieA, "POST", {
          kind: "task",
          title: "只属于账号 A 的收件箱任务",
          content: "integration-visible-marker",
        })
      )
    );
    assert(captured.item.id);
    const inboxA = await json<{ counts: { task: number } }>(
      await inboxRoute.GET(request("http://local/api/inbox?type=task", cookieA))
    );
    assert.equal(inboxA.counts.task, 1);
    const searchA = await json<{ total: number }>(
      await searchRoute.GET(request("http://local/api/search?q=integration-visible-marker", cookieA))
    );
    const searchB = await json<{ total: number }>(
      await searchRoute.GET(request("http://local/api/search?q=integration-visible-marker", cookieB))
    );
    assert.equal(searchA.total, 1);
    assert.equal(searchB.total, 0);

    const planTask = await json<{ id: string }>(
      await taskRoute.POST(
        request("http://local/api/tasks", cookieA, "POST", {
          title: "智能安排候选",
          priority: "P1",
          showInWeekPlan: true,
          estimatedMinutes: 30,
          energyLevel: "high",
          preferredPeriod: "morning",
        })
      )
    );
    const draft = await json<{
      plan: { id: string; items: { id: string; taskId: string }[] };
    }>(
      await draftRoute.POST(
        request("http://local/api/smart-day/drafts", cookieA, "POST", {
          date: "2026-08-24",
          taskIds: [planTask.id],
          useAi: false,
        })
      )
    );
    assert.equal(draft.plan.items.length, 1);
    const planItem = draft.plan.items[0];
    await json(
      await itemRoute.PATCH(
        request("http://local/api/smart-day/items/x", cookieA, "PATCH", {
          action: "accept",
        }),
        { params: Promise.resolve({ id: planItem.id }) }
      )
    );
    await json(
      await confirmRoute.POST(request("http://local/api/smart-day/plans/x/confirm", cookieA, "POST"), {
        params: Promise.resolve({ id: draft.plan.id }),
      })
    );
    const otherPlan = await json<{ plan: unknown }>(
      await smartDayRoute.GET(request("http://local/api/smart-day?date=2026-08-24", cookieB))
    );
    assert.equal(otherPlan.plan, null);

    const focus = await json<{ id: string; status: string }>(
      await focusRoute.POST(
        request("http://local/api/focus-sessions", cookieA, "POST", {
          taskId: planTask.id,
          planItemId: planItem.id,
          date: "2026-08-24",
        })
      )
    );
    assert.equal(focus.status, "running");
    const stopped = await json<{ status: string }>(
      await focusItemRoute.PATCH(
        request("http://local/api/focus-sessions/x", cookieA, "PATCH", { action: "stop" }),
        { params: Promise.resolve({ id: focus.id }) }
      )
    );
    assert.equal(stopped.status, "completed");

    for (const task of [
      { title: "P1 结转", priority: "P1" },
      { title: "P2 退回本周", priority: "P2" },
    ]) {
      await json(
        await taskRoute.POST(
          request("http://local/api/tasks", cookieA, "POST", {
            ...task,
            scheduledDate: "2026-08-23",
          })
        )
      );
    }
    const firstCarryover = await json<{ moved: unknown[]; returnedToWeek: unknown[] }>(
      await carryoverRoute.POST(
        request("http://local/api/reviews/carryover", cookieA, "POST", {
          sourceDate: "2026-08-23",
          targetDate: "2026-08-24",
        })
      )
    );
    assert.equal(firstCarryover.moved.length, 1);
    assert.equal(firstCarryover.returnedToWeek.length, 1);
    const repeatedCarryover = await json<{ moved: unknown[]; returnedToWeek: unknown[] }>(
      await carryoverRoute.POST(
        request("http://local/api/reviews/carryover", cookieA, "POST", {
          sourceDate: "2026-08-23",
          targetDate: "2026-08-24",
        })
      )
    );
    assert.equal(repeatedCarryover.moved.length + repeatedCarryover.returnedToWeek.length, 0);

    const reviewOne = await json<{ id: string }>(
      await reviewRoute.POST(
        request("http://local/api/reviews", cookieA, "POST", {
          periodType: "daily",
          periodStart: "2026-08-24",
          wins: "第一次保存",
        })
      )
    );
    const reviewTwo = await json<{ id: string; notes: string }>(
      await reviewRoute.POST(
        request("http://local/api/reviews", cookieA, "POST", {
          periodType: "daily",
          periodStart: "2026-08-24",
          wins: "第二次保存",
          notes: "幂等更新",
        })
      )
    );
    assert.equal(reviewTwo.id, reviewOne.id);
    assert.equal(reviewTwo.notes, "幂等更新");

    await json(
      await memoryRoute.POST(
        request("http://local/api/agent/memory", cookieA, "POST", {
          category: "explicit",
          key: "daily_capacity_minutes",
          value: 300,
          confirmed: true,
        })
      )
    );
    const memoriesB = await json<{ memories: unknown[] }>(
      await memoryRoute.GET(request("http://local/api/agent/memory", cookieB))
    );
    assert.equal(memoriesB.memories.length, 0);

    const exported = await json<Record<string, unknown>>(
      await exportRoute.GET(request("http://local/api/export", cookieA))
    );
    const hash = exported.sha256;
    const { sha256: _removed, ...withoutHash } = exported;
    const recalculated = createHash("sha256")
      .update(canonicalExportJson(withoutHash), "utf8")
      .digest("hex");
    assert.equal(hash, recalculated);
    const serialized = JSON.stringify(exported);
    assert(!serialized.includes("integration-b"));
    assert(!serialized.includes("test-only-hash"));
    assert(!serialized.includes("sessions"));

    console.log("PASS V3 authenticated plan-execute-review flow is isolated");
  } finally {
    sqlite.close();
    rmSync(path, { force: true });
    rmSync(`${path}-wal`, { force: true });
    rmSync(`${path}-shm`, { force: true });
  }
}

void main().catch((error) => {
  console.error("FAIL V3 authenticated plan-execute-review flow is isolated");
  console.error(error);
  process.exitCode = 1;
});
