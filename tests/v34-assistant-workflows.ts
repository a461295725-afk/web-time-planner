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

async function json<T>(response: Response): Promise<T> {
  const value = (await response.json()) as T;
  assert(response.ok, JSON.stringify(value));
  return value;
}

async function main(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "wtp-v34-workflows-"));
  process.env.DB_PATH = join(directory, "test.db");

  const { sqlite } = await import("../src/db");
  const { issueAssistantToken } = await import("../src/lib/assistant-token-store");
  const { createProject, createTask, getTask, getTasks, updateTask } = await import("../src/lib/server-store");
  const outcomeRoute = await import("../src/app/api/v1/assistant/tasks/[id]/outcomes/route");
  const planDraftRoute = await import("../src/app/api/v1/assistant/plans/drafts/route");
  const planConfirmRoute = await import("../src/app/api/v1/assistant/plans/[id]/confirm/route");
  const reviewDraftRoute = await import("../src/app/api/v1/assistant/review-draft/route");
  const reviewRoute = await import("../src/app/api/v1/assistant/reviews/route");
  const workflowRoute = await import("../src/app/api/v1/assistant/workflows/route");
  const workflowApplyRoute = await import("../src/app/api/v1/assistant/workflows/[id]/apply/route");

  try {
    sqlite
      .prepare(
        "INSERT INTO users (id, username, password_hash, is_admin, created_at) VALUES (?, ?, ?, 1, ?)"
      )
      .run("user-a", "assistant-workflow-user", "test-only", Date.now());
    const issued = issueAssistantToken("user-a", {
      name: "Grok",
      scopes: ["context:read", "tasks:write", "plans:write", "reviews:write", "templates:write"],
    });

    const partialTask = createTask("user-a", {
      title: "完成新版介绍",
      scheduledDate: "2026-09-28",
      nextAction: "先写首屏",
    });
    const partial = await json<{ task: { done: boolean; scheduledDate?: string; nextAction?: string } }>(
      await outcomeRoute.POST(
        assistantRequest(
          `http://local/api/v1/assistant/tasks/${partialTask.id}/outcomes`,
          issued.token,
          "POST",
          {
            date: "2026-09-28",
            outcome: "partial",
            nextAction: "明天补完功能示例",
            rescheduleDate: "2026-09-29",
            actualMinutes: 45,
          },
          "outcome-partial-001"
        ),
        { params: Promise.resolve({ id: partialTask.id }) }
      )
    );
    assert.equal(partial.task.done, false);
    assert.equal(partial.task.scheduledDate, "2026-09-29");
    assert.equal(partial.task.nextAction, "明天补完功能示例");

    const waitingTask = createTask("user-a", { title: "等供应商报价" });
    const postponed = await json<{ task: { executionState?: string; waitingOn?: string; followUpDate?: string } }>(
      await outcomeRoute.POST(
        assistantRequest(
          `http://local/api/v1/assistant/tasks/${waitingTask.id}/outcomes`,
          issued.token,
          "POST",
          {
            date: "2026-09-28",
            outcome: "postponed",
            nextAction: "周五催一次",
            rescheduleDate: "2026-10-02",
            waitingOn: "供应商报价",
            followUpDate: "2026-10-02",
          },
          "outcome-waiting-001"
        ),
        { params: Promise.resolve({ id: waitingTask.id }) }
      )
    );
    assert.equal(postponed.task.executionState, "waiting");
    assert.equal(postponed.task.waitingOn, "供应商报价");
    assert.equal(postponed.task.followUpDate, "2026-10-02");

    const planningTask = createTask("user-a", {
      title: "准备周会材料",
      scheduledDate: "2026-09-28",
      estimatedMinutes: 60,
    });
    const draft = await json<{ plan: { id: string; status: string; items: { taskId: string }[] } }>(
      await planDraftRoute.POST(
        assistantRequest(
          "http://local/api/v1/assistant/plans/drafts",
          issued.token,
          "POST",
          { date: "2026-09-28", taskIds: [planningTask.id], useAi: false },
          "plan-draft-001"
        )
      )
    );
    assert.equal(draft.plan.status, "draft");
    assert(draft.plan.items.some((item) => item.taskId === planningTask.id));
    const confirmed = await json<{ status: string }>(
      await planConfirmRoute.POST(
        assistantRequest(
          `http://local/api/v1/assistant/plans/${draft.plan.id}/confirm`,
          issued.token,
          "POST",
          {},
          "plan-confirm-001"
        ),
        { params: Promise.resolve({ id: draft.plan.id }) }
      )
    );
    assert.equal(confirmed.status, "confirmed");

    const reviewDraft = await json<{
      periodType: string;
      facts: { partialCount: number; postponedCount: number };
      wins: string[];
      blockers: string[];
      nextActions: string[];
    }>(
      await reviewDraftRoute.GET(
        assistantRequest(
          "http://local/api/v1/assistant/review-draft?periodType=weekly&periodStart=2026-09-28",
          issued.token
        )
      )
    );
    assert.equal(reviewDraft.periodType, "weekly");
    assert.equal(reviewDraft.facts.partialCount, 1);
    assert.equal(reviewDraft.facts.postponedCount, 1);
    assert(reviewDraft.nextActions.some((item) => item.includes("补完功能示例")));

    const savedReview = await json<{ periodType: string; periodStart: string }>(
      await reviewRoute.POST(
        assistantRequest(
          "http://local/api/v1/assistant/reviews",
          issued.token,
          "POST",
          {
            periodType: "weekly",
            periodStart: "2026-09-28",
            wins: reviewDraft.wins,
            blockers: reviewDraft.blockers,
            nextAction: reviewDraft.nextActions,
            notes: ["由 Grok 与用户确认后保存"],
          },
          "review-save-001"
        )
      )
    );
    assert.equal(savedReview.periodStart, "2026-09-28");

    const project = createProject("user-a", { name: "内容发布" });
    const template = await json<{ id: string }>(
      await workflowRoute.POST(
        assistantRequest(
          "http://local/api/v1/assistant/workflows",
          issued.token,
          "POST",
          {
            name: "文章发布流程",
            description: "从成稿到发布",
            steps: [
              { key: "launch", title: "发布文章", level: "milestone" },
              { key: "review", title: "完成终稿检查", level: "task", parentKey: "launch" },
              { key: "links", title: "检查链接和图片", level: "action", parentKey: "review", estimatedMinutes: 20 },
            ],
          },
          "workflow-create-001"
        )
      )
    );
    const applied = await json<{ tasks: { id: string; title: string; parentTaskId?: string; taskLevel?: string }[] }>(
      await workflowApplyRoute.POST(
        assistantRequest(
          `http://local/api/v1/assistant/workflows/${template.id}/apply`,
          issued.token,
          "POST",
          { projectId: project.id, scheduledDate: "2026-09-29" },
          "workflow-apply-001"
        ),
        { params: Promise.resolve({ id: template.id }) }
      )
    );
    assert.equal(applied.tasks.length, 3);
    const milestone = applied.tasks.find((item) => item.taskLevel === "milestone")!;
    const task = applied.tasks.find((item) => item.taskLevel === "task")!;
    const action = applied.tasks.find((item) => item.taskLevel === "action")!;
    assert.equal(task.parentTaskId, milestone.id);
    assert.equal(action.parentTaskId, task.id);
    assert.equal(getTask("user-a", action.id)?.projectId, project.id);
    assert(getTasks("user-a").some((item) => item.originRef?.includes(template.id)));
    assert.throws(
      () => updateTask("user-a", milestone.id, { parentTaskId: action.id }),
      /任务层级不能形成循环/
    );

    console.log("PASS V3.4 external plan, outcome, review, and workflow loops");
  } finally {
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error("FAIL V3.4 external plan, outcome, review, and workflow loops");
  console.error(error);
  process.exitCode = 1;
});
