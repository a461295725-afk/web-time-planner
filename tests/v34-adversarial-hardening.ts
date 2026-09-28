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

function sessionRequest(
  url: string,
  sessionToken: string,
  method = "GET",
  body?: unknown
): Request {
  const headers = new Headers({ cookie: `wtp_session=${sessionToken}` });
  if (body !== undefined) headers.set("content-type", "application/json");
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
  const directory = mkdtempSync(join(tmpdir(), "wtp-v34-adversarial-"));
  process.env.DB_PATH = join(directory, "test.db");

  const { sqlite } = await import("../src/db");
  const { issueAssistantToken } = await import("../src/lib/assistant-token-store");
  const { createSession } = await import("../src/lib/auth");
  const { createProject, createTask } = await import("../src/lib/server-store");
  const { shiftDate, todayKey } = await import("../src/lib/date");
  const draftRoute = await import("../src/app/api/v1/assistant/plans/drafts/route");
  const confirmRoute = await import("../src/app/api/v1/assistant/plans/[id]/confirm/route");
  const planItemRoute = await import("../src/app/api/v1/assistant/plans/items/[id]/route");
  const planRoute = await import("../src/app/api/v1/assistant/plans/route");
  const outcomeRoute = await import("../src/app/api/v1/assistant/tasks/[id]/outcomes/route");
  const reviewDraftRoute = await import("../src/app/api/v1/assistant/review-draft/route");
  const externalTaskRoute = await import("../src/app/api/v1/tasks/route");
  const webTaskRoute = await import("../src/app/api/tasks/route");
  const externalProjectRoute = await import("../src/app/api/v1/projects/[id]/route");
  const externalProjectsRoute = await import("../src/app/api/v1/projects/route");
  const legacySmartDayRoute = await import("../src/app/api/v1/smart-day/route");
  const freebusyRoute = await import("../src/app/api/v1/freebusy/route");
  const workflowRoute = await import("../src/app/api/v1/assistant/workflows/route");

  try {
    sqlite
      .prepare(
        "INSERT INTO users (id, username, password_hash, is_admin, created_at) VALUES (?, ?, ?, 1, ?)"
      )
      .run("user-a", "adversarial-user", "test-only", Date.now());
    const issued = issueAssistantToken("user-a", {
      name: "Grok adversarial",
      scopes: ["context:read", "tasks:write", "plans:write", "reviews:write", "templates:write"],
    });
    const session = createSession("user-a");
    const readOnly = issueAssistantToken("user-a", {
      name: "Grok read only",
      scopes: ["context:read"],
    });
    const firstTask = createTask("user-a", {
      title: "已经确认的任务",
      scheduledDate: "2026-10-05",
      estimatedMinutes: 60,
    });
    const initialDraftResponse = await draftRoute.POST(
      assistantRequest(
        "http://local/api/v1/assistant/plans/drafts",
        issued.token,
        "POST",
        { date: "2026-10-05", taskIds: [firstTask.id], useAi: false },
        "confirmed-plan-initial-draft"
      )
    );
    assert.equal(initialDraftResponse.status, 201);
    const initialDraft = await responseJson<{ plan: { id: string; version: number } }>(
      initialDraftResponse
    );
    const confirmedResponse = await confirmRoute.POST(
      assistantRequest(
        `http://local/api/v1/assistant/plans/${initialDraft.plan.id}/confirm`,
        issued.token,
        "POST",
        {},
        "confirmed-plan-confirm"
      ),
      { params: Promise.resolve({ id: initialDraft.plan.id }) }
    );
    assert.equal(confirmedResponse.status, 200);

    const replacementTask = createTask("user-a", {
      title: "不应悄悄覆盖确认计划",
      scheduledDate: "2026-10-05",
      estimatedMinutes: 30,
    });
    const rejectedReplacement = await draftRoute.POST(
      assistantRequest(
        "http://local/api/v1/assistant/plans/drafts",
        issued.token,
        "POST",
        { date: "2026-10-05", taskIds: [replacementTask.id], useAi: false },
        "confirmed-plan-replacement-rejected"
      )
    );
    assert.equal(rejectedReplacement.status, 409);
    assert.deepEqual(await responseJson(rejectedReplacement), {
      error: "该日期计划已确认，不能直接覆盖",
    });

    const snapshotResponse = await planRoute.GET(
      assistantRequest(
        "http://local/api/v1/assistant/plans?date=2026-10-05",
        issued.token
      )
    );
    assert.equal(snapshotResponse.status, 200);
    const snapshot = await responseJson<{
      plan: { status: string; version: number; items: { taskId: string }[] };
    }>(snapshotResponse);
    assert.equal(snapshot.plan.status, "confirmed");
    assert.equal(snapshot.plan.version, initialDraft.plan.version);
    assert.deepEqual(snapshot.plan.items.map((item) => item.taskId), [firstTask.id]);
    console.log("PASS confirmed plan rejects an implicit replacement");

    const explicitReplacementResponse = await draftRoute.POST(
      assistantRequest(
        "http://local/api/v1/assistant/plans/drafts",
        issued.token,
        "POST",
        {
          date: "2026-10-05",
          taskIds: [replacementTask.id],
          useAi: false,
          replaceConfirmed: true,
        },
        "confirmed-plan-explicit-replacement"
      )
    );
    assert.equal(explicitReplacementResponse.status, 201);
    const explicitReplacement = await responseJson<{
      plan: { status: string; version: number; items: { taskId: string }[] };
      previousConfirmedVersion: number;
    }>(explicitReplacementResponse);
    assert.equal(explicitReplacement.previousConfirmedVersion, initialDraft.plan.version);
    assert.equal(explicitReplacement.plan.status, "draft");
    assert.equal(explicitReplacement.plan.version, initialDraft.plan.version + 1);
    assert.deepEqual(
      explicitReplacement.plan.items.map((item) => item.taskId),
      [replacementTask.id]
    );

    const replacementSnapshotResponse = await planRoute.GET(
      assistantRequest(
        "http://local/api/v1/assistant/plans?date=2026-10-05",
        issued.token
      )
    );
    assert.equal(replacementSnapshotResponse.status, 200);
    const replacementSnapshot = await responseJson<{
      plan: { status: string; version: number };
      history: { version: number; snapshot: { status: string; items: { taskId: string }[] } }[];
    }>(replacementSnapshotResponse);
    assert.equal(replacementSnapshot.plan.status, "draft");
    assert.equal(replacementSnapshot.history.length, 1);
    assert.equal(replacementSnapshot.history[0].version, initialDraft.plan.version);
    assert.equal(replacementSnapshot.history[0].snapshot.status, "confirmed");
    assert.deepEqual(
      replacementSnapshot.history[0].snapshot.items.map((item) => item.taskId),
      [firstTask.id]
    );
    console.log("PASS explicit replacement preserves the confirmed plan history");

    const droppedTask = createTask("user-a", {
      title: "决定不再继续的任务",
      scheduledDate: "2026-10-06",
      estimatedMinutes: 45,
    });
    const droppedResponse = await outcomeRoute.POST(
      assistantRequest(
        `http://local/api/v1/assistant/tasks/${droppedTask.id}/outcomes`,
        issued.token,
        "POST",
        { date: "2026-10-06", outcome: "dropped", note: "优先级已经改变" },
        "dropped-is-not-done"
      ),
      { params: Promise.resolve({ id: droppedTask.id }) }
    );
    assert.equal(droppedResponse.status, 201);
    const dropped = await responseJson<{
      task: { done: boolean; completionOutcome?: string };
    }>(droppedResponse);
    assert.equal(dropped.task.done, true);
    assert.equal(dropped.task.completionOutcome, "dropped");

    const droppedReviewResponse = await reviewDraftRoute.GET(
      assistantRequest(
        "http://local/api/v1/assistant/review-draft?periodType=daily&periodStart=2026-10-06",
        issued.token
      )
    );
    assert.equal(droppedReviewResponse.status, 200);
    const droppedReview = await responseJson<{
      metrics: {
        plannedCount: number;
        plannedDoneCount: number;
        completedCount: number;
        droppedCount: number;
      };
      facts: { droppedCount: number };
    }>(droppedReviewResponse);
    assert.equal(droppedReview.metrics.plannedCount, 1);
    assert.equal(droppedReview.metrics.plannedDoneCount, 0);
    assert.equal(droppedReview.metrics.completedCount, 0);
    assert.equal(droppedReview.metrics.droppedCount, 1);
    assert.equal(droppedReview.facts.droppedCount, 1);
    console.log("PASS dropped closes a task without counting it as completed");

    const outcomeDate = todayKey();
    const tomorrow = shiftDate(outcomeDate, 1);
    const validationTask = createTask("user-a", {
      title: "验证执行结果规则",
      scheduledDate: outcomeDate,
    });
    const missingPartialNextAction = await outcomeRoute.POST(
      assistantRequest(
        `http://local/api/v1/assistant/tasks/${validationTask.id}/outcomes`,
        issued.token,
        "POST",
        { date: outcomeDate, outcome: "partial" },
        "partial-missing-next-action"
      ),
      { params: Promise.resolve({ id: validationTask.id }) }
    );
    assert.equal(missingPartialNextAction.status, 400);
    assert.deepEqual(await responseJson(missingPartialNextAction), {
      error: "部分完成必须填写下一步",
    });

    const missingPostponedDate = await outcomeRoute.POST(
      assistantRequest(
        `http://local/api/v1/assistant/tasks/${validationTask.id}/outcomes`,
        issued.token,
        "POST",
        { date: outcomeDate, outcome: "postponed", nextAction: "明天继续" },
        "postponed-missing-date"
      ),
      { params: Promise.resolve({ id: validationTask.id }) }
    );
    assert.equal(missingPostponedDate.status, 400);
    assert.deepEqual(await responseJson(missingPostponedDate), {
      error: "推迟任务必须填写重新安排日期",
    });

    const partialSameDay = await outcomeRoute.POST(
      assistantRequest(
        `http://local/api/v1/assistant/tasks/${validationTask.id}/outcomes`,
        issued.token,
        "POST",
        {
          date: outcomeDate,
          outcome: "partial",
          nextAction: "今天下午继续",
          rescheduleDate: outcomeDate,
        },
        "partial-same-day"
      ),
      { params: Promise.resolve({ id: validationTask.id }) }
    );
    assert.equal(partialSameDay.status, 201);

    const pastPostponed = await outcomeRoute.POST(
      assistantRequest(
        `http://local/api/v1/assistant/tasks/${validationTask.id}/outcomes`,
        issued.token,
        "POST",
        {
          date: outcomeDate,
          outcome: "postponed",
          nextAction: "以后再做",
          rescheduleDate: "2020-01-01",
        },
        "postponed-past-date"
      ),
      { params: Promise.resolve({ id: validationTask.id }) }
    );
    assert.equal(pastPostponed.status, 400);
    assert.deepEqual(await responseJson(pastPostponed), {
      error: "重新安排日期必须晚于结果日期且不能早于今天",
    });

    const latestTask = createTask("user-a", {
      title: "同日多次更新只统计最后结果",
      scheduledDate: outcomeDate,
    });
    const outcomeInputs = [
      {
        key: "latest-outcome-partial-first",
        body: { date: outcomeDate, outcome: "partial", nextAction: "先完成第一部分" },
      },
      {
        key: "latest-outcome-postponed-middle",
        body: {
          date: outcomeDate,
          outcome: "postponed",
          nextAction: "明天重新开始",
          rescheduleDate: tomorrow,
          waitingOn: "等待资料",
          followUpDate: tomorrow,
          blocker: "资料还没到",
        },
      },
      {
        key: "latest-outcome-partial-last",
        body: { date: outcomeDate, outcome: "partial", nextAction: "资料到了以后补完" },
      },
    ];
    for (const item of outcomeInputs) {
      const response = await outcomeRoute.POST(
        assistantRequest(
          `http://local/api/v1/assistant/tasks/${latestTask.id}/outcomes`,
          issued.token,
          "POST",
          item.body,
          item.key
        ),
        { params: Promise.resolve({ id: latestTask.id }) }
      );
      assert.equal(response.status, 201);
    }

    const outcomeHistoryResponse = await outcomeRoute.GET(
      assistantRequest(
        `http://local/api/v1/assistant/tasks/${latestTask.id}/outcomes`,
        issued.token
      ),
      { params: Promise.resolve({ id: latestTask.id }) }
    );
    assert.equal(outcomeHistoryResponse.status, 200);
    const outcomeHistory = await responseJson<{
      outcomes: {
        outcome: string;
        rescheduleDate?: string;
        waitingOn?: string;
        followUpDate?: string;
        blocker?: string;
      }[];
    }>(outcomeHistoryResponse);
    assert.equal(outcomeHistory.outcomes.length, 3);
    const postponedHistory = outcomeHistory.outcomes.find(
      (item) => item.outcome === "postponed"
    );
    assert.deepEqual(postponedHistory, {
      ...postponedHistory,
      outcome: "postponed",
      rescheduleDate: tomorrow,
      waitingOn: "等待资料",
      followUpDate: tomorrow,
      blocker: "资料还没到",
    });

    const latestReviewResponse = await reviewDraftRoute.GET(
      assistantRequest(
        `http://local/api/v1/assistant/review-draft?periodType=daily&periodStart=${outcomeDate}`,
        issued.token
      )
    );
    assert.equal(latestReviewResponse.status, 200);
    const latestReview = await responseJson<{
      metrics: { partialCount: number; postponedCount: number };
      facts: { partialCount: number; postponedCount: number };
    }>(latestReviewResponse);
    assert.equal(latestReview.metrics.partialCount, 2);
    assert.equal(latestReview.metrics.postponedCount, 0);
    assert.equal(latestReview.facts.partialCount, 2);
    assert.equal(latestReview.facts.postponedCount, 0);
    console.log("PASS outcome validation and latest-per-task-day review semantics");

    const tooLongDescription = "描".repeat(1_000_000);
    const assistantLongDescription = await externalTaskRoute.POST(
      assistantRequest(
        "http://local/api/v1/tasks",
        issued.token,
        "POST",
        { title: "超长助手任务", description: tooLongDescription },
        "task-description-too-long"
      )
    );
    assert.equal(assistantLongDescription.status, 400);
    assert.deepEqual(await responseJson(assistantLongDescription), {
      error: "任务描述不能超过 5000 个字符",
    });

    const webLongDescription = await webTaskRoute.POST(
      sessionRequest("http://local/api/tasks", session.token, "POST", {
        title: "超长网页任务",
        description: tooLongDescription,
      })
    );
    assert.equal(webLongDescription.status, 400);
    assert.deepEqual(await responseJson(webLongDescription), {
      error: "任务描述不能超过 5000 个字符",
    });

    const editableTask = createTask("user-a", { title: "不能被空标题静默保留" });
    const assistantEmptyTitle = await externalTaskRoute.PATCH(
      assistantRequest(
        "http://local/api/v1/tasks",
        issued.token,
        "PATCH",
        { id: editableTask.id, title: "" },
        "task-empty-title-assistant"
      )
    );
    assert.equal(assistantEmptyTitle.status, 400);
    assert.deepEqual(await responseJson(assistantEmptyTitle), {
      error: "任务标题不能为空",
    });

    const webEmptyTitle = await webTaskRoute.PATCH(
      sessionRequest("http://local/api/tasks", session.token, "PATCH", {
        id: editableTask.id,
        title: "   ",
      })
    );
    assert.equal(webEmptyTitle.status, 400);
    assert.deepEqual(await responseJson(webEmptyTitle), {
      error: "任务标题不能为空",
    });

    const tooLongNextAction = await externalTaskRoute.PATCH(
      assistantRequest(
        "http://local/api/v1/tasks",
        issued.token,
        "PATCH",
        { id: editableTask.id, nextAction: "下".repeat(501) },
        "task-next-action-too-long"
      )
    );
    assert.equal(tooLongNextAction.status, 400);
    assert.deepEqual(await responseJson(tooLongNextAction), {
      error: "下一步不能超过 500 个字符",
    });
    console.log("PASS task text limits are shared by assistant and web routes");

    const assistantTaskDelete = await externalTaskRoute.DELETE(
      assistantRequest(
        "http://local/api/v1/tasks",
        issued.token,
        "DELETE",
        { id: "missing-task" },
        "assistant-delete-task"
      )
    );
    assert.equal(assistantTaskDelete.status, 403);
    assert.deepEqual(await responseJson(assistantTaskDelete), {
      error: "助手不能删除，请用 outcome=dropped",
    });

    const readOnlyTaskDelete = await externalTaskRoute.DELETE(
      assistantRequest(
        "http://local/api/v1/tasks",
        readOnly.token,
        "DELETE",
        { id: "missing-task" },
        "read-only-delete-task"
      )
    );
    assert.equal(readOnlyTaskDelete.status, 403);

    const assistantProjectDelete = await externalProjectRoute.DELETE(
      assistantRequest(
        "http://local/api/v1/projects/missing-project",
        issued.token,
        "DELETE"
      ),
      { params: Promise.resolve({ id: "missing-project" }) }
    );
    assert.equal(assistantProjectDelete.status, 403);

    const assistantWorkflowDelete = await workflowRoute.DELETE(
      assistantRequest(
        "http://local/api/v1/assistant/workflows",
        issued.token,
        "DELETE"
      )
    );
    assert.equal(assistantWorkflowDelete.status, 403);
    console.log("PASS assistant tokens cannot delete domain objects");

    const malformedAssistantJson = await draftRoute.POST(
      new Request("http://local/api/v1/assistant/plans/drafts", {
        method: "POST",
        headers: {
          "X-API-Token": issued.token,
          "content-type": "application/json",
        },
        body: "{",
      })
    );
    assert.equal(malformedAssistantJson.status, 400);
    assert.deepEqual(await responseJson(malformedAssistantJson), {
      error: "请求体必须是合法 JSON",
    });

    const wrongAssistantContentType = await draftRoute.POST(
      new Request("http://local/api/v1/assistant/plans/drafts", {
        method: "POST",
        headers: {
          "X-API-Token": issued.token,
          "content-type": "text/plain",
        },
        body: "{}",
      })
    );
    assert.equal(wrongAssistantContentType.status, 400);
    assert.deepEqual(await responseJson(wrongAssistantContentType), {
      error: "请求体必须是合法 JSON",
    });

    const malformedConfirmJson = await confirmRoute.POST(
      new Request(
        `http://local/api/v1/assistant/plans/${initialDraft.plan.id}/confirm`,
        {
          method: "POST",
          headers: {
            "X-API-Token": issued.token,
            "content-type": "application/json",
          },
          body: "{",
        }
      ),
      { params: Promise.resolve({ id: initialDraft.plan.id }) }
    );
    assert.equal(malformedConfirmJson.status, 400);
    assert.deepEqual(await responseJson(malformedConfirmJson), {
      error: "请求体必须是合法 JSON",
    });

    const wrongTaskContentType = await externalTaskRoute.POST(
      new Request("http://local/api/v1/tasks", {
        method: "POST",
        headers: {
          "X-API-Token": issued.token,
          "content-type": "text/plain",
        },
        body: JSON.stringify({ title: "不应接受的纯文本任务" }),
      })
    );
    assert.equal(wrongTaskContentType.status, 400);
    assert.deepEqual(await responseJson(wrongTaskContentType), {
      error: "请求体必须是合法 JSON",
    });
    console.log("PASS assistant writes require valid application/json bodies");

    const emptyTaskIds = await draftRoute.POST(
      assistantRequest(
        "http://local/api/v1/assistant/plans/drafts",
        issued.token,
        "POST",
        { date: "2026-10-06", taskIds: [], useAi: false },
        "empty-task-ids"
      )
    );
    assert.equal(emptyTaskIds.status, 400);
    assert.deepEqual(await responseJson(emptyTaskIds), {
      error: "taskIds 不能为空",
    });

    const summaryTaskA = createTask("user-a", {
      title: "摘要任务 A",
      scheduledDate: "2026-10-07",
      estimatedMinutes: 120,
    });
    const summaryTaskB = createTask("user-a", {
      title: "摘要任务 B",
      scheduledDate: "2026-10-07",
      estimatedMinutes: 180,
    });
    const summaryDraftResponse = await draftRoute.POST(
      assistantRequest(
        "http://local/api/v1/assistant/plans/drafts",
        issued.token,
        "POST",
        {
          date: "2026-10-07",
          taskIds: [summaryTaskA.id, summaryTaskB.id],
          useAi: false,
        },
        "summary-draft"
      )
    );
    assert.equal(summaryDraftResponse.status, 201);
    const summaryDraft = await responseJson<{
      plan: {
        summary: string;
        items: { id: string; startMinute: number; endMinute: number }[];
      };
    }>(summaryDraftResponse);
    assert.equal(summaryDraft.plan.summary, "已安排 2 项，共 300 分钟");
    const rejectedItem = summaryDraft.plan.items[0];
    const remainingItem = summaryDraft.plan.items[1];
    const rejectedSummaryItem = await planItemRoute.PATCH(
      assistantRequest(
        `http://local/api/v1/assistant/plans/items/${rejectedItem.id}`,
        issued.token,
        "PATCH",
        { action: "reject" },
        "summary-reject-item"
      ),
      { params: Promise.resolve({ id: rejectedItem.id }) }
    );
    assert.equal(rejectedSummaryItem.status, 200);

    const refreshedSummaryResponse = await planRoute.GET(
      assistantRequest(
        "http://local/api/v1/assistant/plans?date=2026-10-07",
        issued.token
      )
    );
    assert.equal(refreshedSummaryResponse.status, 200);
    const refreshedSummary = await responseJson<{ plan: { summary: string } }>(
      refreshedSummaryResponse
    );
    assert.equal(
      refreshedSummary.plan.summary,
      `已安排 1 项，共 ${remainingItem.endMinute - remainingItem.startMinute} 分钟`
    );
    console.log("PASS plan drafts reject empty selections and keep summaries current");

    const missingOutcomeHistory = await outcomeRoute.GET(
      assistantRequest(
        "http://local/api/v1/assistant/tasks/missing-task/outcomes",
        issued.token
      ),
      { params: Promise.resolve({ id: "missing-task" }) }
    );
    assert.equal(missingOutcomeHistory.status, 404);
    assert.deepEqual(await responseJson(missingOutcomeHistory), {
      error: "任务不存在或不可访问",
    });

    const missingOutcomeWrite = await outcomeRoute.POST(
      assistantRequest(
        "http://local/api/v1/assistant/tasks/missing-task/outcomes",
        issued.token,
        "POST",
        { date: "2026-10-08", outcome: "done" },
        "missing-outcome-write"
      ),
      { params: Promise.resolve({ id: "missing-task" }) }
    );
    assert.equal(missingOutcomeWrite.status, 404);
    assert.deepEqual(await responseJson(missingOutcomeWrite), {
      error: "任务不存在或不可访问",
    });

    const missingDraftTask = await draftRoute.POST(
      assistantRequest(
        "http://local/api/v1/assistant/plans/drafts",
        issued.token,
        "POST",
        { date: "2026-10-08", taskIds: ["missing-task"], useAi: false },
        "missing-draft-task"
      )
    );
    assert.equal(missingDraftTask.status, 404);
    assert.deepEqual(await responseJson(missingDraftTask), {
      error: "任务不存在或不可访问",
    });
    console.log("PASS missing task references return a stable not-found response");

    const readableProject = createProject("user-a", {
      name: "只读助手可见项目",
      dueDate: "2026-10-31",
    });
    const assistantSmartDay = await legacySmartDayRoute.GET(
      assistantRequest(
        "http://local/api/v1/smart-day?date=2026-10-09&kind=morning",
        readOnly.token
      )
    );
    assert.equal(assistantSmartDay.status, 200);

    const assistantFreebusy = await freebusyRoute.GET(
      assistantRequest(
        "http://local/api/v1/freebusy?from=2026-10-05&to=2026-10-11",
        readOnly.token
      )
    );
    assert.equal(assistantFreebusy.status, 200);

    const assistantProjects = await externalProjectsRoute.GET(
      assistantRequest("http://local/api/v1/projects", readOnly.token)
    );
    assert.equal(assistantProjects.status, 200);

    const assistantProjectDetails = await externalProjectRoute.GET(
      assistantRequest(
        `http://local/api/v1/projects/${readableProject.id}`,
        readOnly.token
      ),
      { params: Promise.resolve({ id: readableProject.id }) }
    );
    assert.equal(assistantProjectDetails.status, 200);

    const assistantProjectWrite = await externalProjectsRoute.POST(
      assistantRequest(
        "http://local/api/v1/projects",
        readOnly.token,
        "POST",
        { name: "不应写入" }
      )
    );
    assert.equal(assistantProjectWrite.status, 401);
    console.log("PASS read-only assistant tokens can reuse legacy context GET routes only");
  } finally {
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error("FAIL V3.4 adversarial hardening");
  console.error(error);
  process.exitCode = 1;
});
