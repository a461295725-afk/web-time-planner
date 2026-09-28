import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function assistantRequest(
  url: string,
  token: string,
  method = "GET",
  body?: unknown,
  idempotencyKey?: string
): Request {
  const headers = new Headers({ "X-API-Token": token });
  if (body !== undefined) headers.set("content-type", "application/json");
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
  return new Request(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function responseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function main(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "wtp-v34-adversarial-round2-"));
  process.env.DB_PATH = join(directory, "test.db");

  const { sqlite } = await import("../src/db");
  const { issueAssistantToken } = await import("../src/lib/assistant-token-store");
  const { createTask } = await import("../src/lib/server-store");
  const { shiftDate, todayKey } = await import("../src/lib/date");
  const draftRoute = await import("../src/app/api/v1/assistant/plans/drafts/route");
  const planRoute = await import("../src/app/api/v1/assistant/plans/route");
  const planItemRoute = await import("../src/app/api/v1/assistant/plans/items/[id]/route");
  const outcomeRoute = await import("../src/app/api/v1/assistant/tasks/[id]/outcomes/route");
  const reviewDraftRoute = await import("../src/app/api/v1/assistant/review-draft/route");
  const workflowApplyRoute = await import(
    "../src/app/api/v1/assistant/workflows/[id]/apply/route"
  );

  try {
    sqlite
      .prepare(
        "INSERT INTO users (id, username, password_hash, is_admin, created_at) VALUES (?, ?, ?, 1, ?)"
      )
      .run("user-a", "assistant-round2-user", "test-only", Date.now());
    const issued = issueAssistantToken("user-a", {
      name: "Grok",
      scopes: ["context:read", "plans:write", "tasks:write", "templates:write"],
    });
    const task = createTask("user-a", {
      title: "验证并发幂等",
      scheduledDate: "2026-09-28",
      estimatedMinutes: 30,
    });
    const payload = {
      date: "2026-09-28",
      taskIds: [task.id],
      useAi: false,
    };
    const key = "concurrent-plan-draft-001";

    const [first, second] = await Promise.all([
      draftRoute.POST(
        assistantRequest(
          "http://local/api/v1/assistant/plans/drafts",
          issued.token,
          "POST",
          payload,
          key
        )
      ),
      draftRoute.POST(
        assistantRequest(
          "http://local/api/v1/assistant/plans/drafts",
          issued.token,
          "POST",
          payload,
          key
        )
      ),
    ]);

    assert.deepEqual(
      [first.status, second.status].sort((a, b) => a - b),
      [201, 409]
    );
    const pending = first.status === 409 ? first : second;
    assert.deepEqual(await responseJson(pending), {
      error: "同一请求正在处理中，请稍后使用相同 Idempotency-Key 重试",
    });

    const currentResponse = await planRoute.GET(
      assistantRequest(
        "http://local/api/v1/assistant/plans?date=2026-09-28",
        issued.token
      )
    );
    assert.equal(currentResponse.status, 200);
    const current = await responseJson<{
      plan: {
        id: string;
        version: number;
        items: {
          id: string;
          taskId: string;
          block: "morning" | "afternoon" | "evening";
          startMinute: number;
          endMinute: number;
        }[];
      };
    }>(currentResponse);
    assert.equal(current.plan.version, 1);
    assert.deepEqual(current.plan.items.map((item) => item.taskId), [task.id]);

    const replay = await draftRoute.POST(
      assistantRequest(
        "http://local/api/v1/assistant/plans/drafts",
        issued.token,
        "POST",
        payload,
        key
      )
    );
    assert.equal(replay.status, 201);
    assert.equal(replay.headers.get("Idempotency-Replayed"), "true");
    const replayed = await responseJson<{ plan: { id: string; version: number } }>(replay);
    assert.equal(replayed.plan.id, current.plan.id);
    assert.equal(replayed.plan.version, 1);
    console.log("PASS concurrent idempotent mutations execute exactly once and replay safely");

    const nullBody = await draftRoute.POST(
      assistantRequest(
        "http://local/api/v1/assistant/plans/drafts",
        issued.token,
        "POST",
        null,
        "null-plan-draft-body-001"
      )
    );
    assert.equal(nullBody.status, 400);
    assert.deepEqual(await responseJson(nullBody), {
      error: "请求体必须是 JSON 对象",
    });
    console.log("PASS mutation bodies must be JSON objects");

    const historicalTask = createTask("user-a", {
      title: "验证历史复盘不可变",
      scheduledDate: "2026-09-27",
      estimatedMinutes: 40,
    });
    const done = await outcomeRoute.POST(
      assistantRequest(
        `http://local/api/v1/assistant/tasks/${historicalTask.id}/outcomes`,
        issued.token,
        "POST",
        { date: "2026-09-27", outcome: "done", actualMinutes: 35 },
        "historical-done-001"
      ),
      { params: Promise.resolve({ id: historicalTask.id }) }
    );
    assert.equal(done.status, 201);
    const continued = await outcomeRoute.POST(
      assistantRequest(
        `http://local/api/v1/assistant/tasks/${historicalTask.id}/outcomes`,
        issued.token,
        "POST",
        {
          date: "2026-09-28",
          outcome: "partial",
          nextAction: "明天继续收尾",
          rescheduleDate: "2026-09-29",
        },
        "historical-continued-001"
      ),
      { params: Promise.resolve({ id: historicalTask.id }) }
    );
    assert.equal(continued.status, 201);

    const historicalReviewResponse = await reviewDraftRoute.GET(
      assistantRequest(
        "http://local/api/v1/assistant/review-draft?periodType=daily&periodStart=2026-09-27",
        issued.token
      )
    );
    assert.equal(historicalReviewResponse.status, 200);
    const historicalReview = await responseJson<{
      metrics: {
        plannedCount: number;
        plannedDoneCount: number;
        completedCount: number;
        plannedMinutes: number;
      };
      facts: { doneCount: number };
    }>(historicalReviewResponse);
    assert.deepEqual(historicalReview.metrics, {
      ...historicalReview.metrics,
      plannedCount: 1,
      plannedDoneCount: 1,
      completedCount: 1,
      plannedMinutes: 40,
    });
    assert.equal(historicalReview.facts.doneCount, 1);
    console.log("PASS historical review metrics survive later task state changes");

    const missedPlanDate = shiftDate(todayKey(), -2);
    const missedPlanTask = createTask("user-a", {
      title: "延后记录的未完成计划",
      scheduledDate: missedPlanDate,
      estimatedMinutes: 25,
    });
    const latePartial = await outcomeRoute.POST(
      assistantRequest(
        `http://local/api/v1/assistant/tasks/${missedPlanTask.id}/outcomes`,
        issued.token,
        "POST",
        {
          date: todayKey(),
          outcome: "partial",
          nextAction: "明天重新开始",
          rescheduleDate: shiftDate(todayKey(), 1),
        },
        "late-partial-outcome-001"
      ),
      { params: Promise.resolve({ id: missedPlanTask.id }) }
    );
    assert.equal(latePartial.status, 201);
    const missedPlanReviewResponse = await reviewDraftRoute.GET(
      assistantRequest(
        `http://local/api/v1/assistant/review-draft?periodType=daily&periodStart=${missedPlanDate}`,
        issued.token
      )
    );
    assert.equal(missedPlanReviewResponse.status, 200);
    const missedPlanReview = await responseJson<{
      metrics: { plannedCount: number; plannedDoneCount: number; plannedMinutes: number };
    }>(missedPlanReviewResponse);
    assert.equal(missedPlanReview.metrics.plannedCount, 1);
    assert.equal(missedPlanReview.metrics.plannedDoneCount, 0);
    assert.equal(missedPlanReview.metrics.plannedMinutes, 25);
    console.log("PASS late outcome records preserve the original planned day");

    const futureTask = createTask("user-a", { title: "不能提前宣布完成" });
    const futureOutcome = await outcomeRoute.POST(
      assistantRequest(
        `http://local/api/v1/assistant/tasks/${futureTask.id}/outcomes`,
        issued.token,
        "POST",
        { date: shiftDate(todayKey(), 1), outcome: "done" },
        "future-outcome-001"
      ),
      { params: Promise.resolve({ id: futureTask.id }) }
    );
    assert.equal(futureOutcome.status, 400);
    assert.deepEqual(await responseJson(futureOutcome), {
      error: "结果日期不能晚于今天",
    });
    console.log("PASS future task outcomes are rejected");

    const missingWorkflow = await workflowApplyRoute.POST(
      assistantRequest(
        "http://local/api/v1/assistant/workflows/missing-template/apply",
        issued.token,
        "POST",
        {},
        "missing-workflow-template-001"
      ),
      { params: Promise.resolve({ id: "missing-template" }) }
    );
    assert.equal(missingWorkflow.status, 404);
    assert.deepEqual(await responseJson(missingWorkflow), {
      error: "流程模板不存在或不可访问",
    });
    console.log("PASS missing workflow resources use a tenant-safe not-found response");

    const movableItem = current.plan.items[0];
    const invalidPosition = await planItemRoute.PATCH(
      assistantRequest(
        `http://local/api/v1/assistant/plans/items/${movableItem.id}`,
        issued.token,
        "PATCH",
        {
          action: "move",
          block: movableItem.block,
          startMinute: movableItem.startMinute,
          endMinute: movableItem.endMinute,
          position: "not-a-number",
        },
        "invalid-plan-item-position-001"
      ),
      { params: Promise.resolve({ id: movableItem.id }) }
    );
    assert.equal(invalidPosition.status, 400);
    assert.deepEqual(await responseJson(invalidPosition), {
      error: "计划项位置无效",
    });
    console.log("PASS invalid plan item positions fail at the domain boundary");

    const invalidDraftDate = await draftRoute.POST(
      assistantRequest(
        "http://local/api/v1/assistant/plans/drafts",
        issued.token,
        "POST",
        { date: 12345, taskIds: [task.id], useAi: false },
        "invalid-plan-draft-date-001"
      )
    );
    assert.equal(invalidDraftDate.status, 400);
    assert.deepEqual(await responseJson(invalidDraftDate), {
      error: "date 日期无效",
    });
    console.log("PASS explicit invalid plan dates are never coerced to today");
  } finally {
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error("FAIL V3.4 adversarial round 2");
  console.error(error);
  process.exitCode = 1;
});
