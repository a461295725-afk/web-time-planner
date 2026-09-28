import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function request(
  url: string,
  cookie: string,
  method = "GET",
  body?: unknown
): Request {
  const headers = new Headers({ cookie });
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function assistantRequest(url: string, token?: string): Request {
  const headers = new Headers();
  if (token) headers.set("X-API-Token", token);
  return new Request(url, { headers });
}

function assistantMutationRequest(
  url: string,
  token: string,
  method: string,
  idempotencyKey: string,
  body: unknown
): Request {
  const headers = new Headers({
    "X-API-Token": token,
    "Idempotency-Key": idempotencyKey,
    "content-type": "application/json",
  });
  return new Request(url, { method, headers, body: JSON.stringify(body) });
}

async function json<T>(response: Response): Promise<T> {
  const value = (await response.json()) as T;
  assert(response.ok, JSON.stringify(value));
  return value;
}

async function main(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "wtp-v34-"));
  const path = join(directory, "test.db");
  process.env.DB_PATH = path;

  const { sqlite } = await import("../src/db");
  const { createSession } = await import("../src/lib/auth");
  const taskRoute = await import("../src/app/api/tasks/route");
  const outcomeRoute = await import("../src/app/api/tasks/[id]/outcomes/route");
  const assistantTokenRoute = await import("../src/app/api/assistant-tokens/route");
  const assistantContextRoute = await import("../src/app/api/v1/assistant/context/route");
  const externalTaskRoute = await import("../src/app/api/v1/tasks/route");

  try {
    sqlite
      .prepare(
        "INSERT INTO users (id, username, password_hash, is_admin, created_at) VALUES (?, ?, ?, 1, ?)"
      )
      .run("user-a", "v34-user", "test-only", Date.now());
    const cookie = `wtp_session=${createSession("user-a").token}`;
    const task = await json<{ id: string; done: boolean }>(
      await taskRoute.POST(
        request("http://local/api/tasks", cookie, "POST", {
          title: "修改首页文案",
          estimatedMinutes: 60,
        })
      )
    );

    const partial = await json<{
      outcome: { outcome: string; actualMinutes: number; nextAction: string };
      task: { done: boolean; nextAction: string };
    }>(
      await outcomeRoute.POST(
        request(`http://local/api/tasks/${task.id}/outcomes`, cookie, "POST", {
          date: "2026-09-28",
          outcome: "partial",
          actualMinutes: 50,
          nextAction: "继续修改功能介绍部分",
          note: "完成了首屏文案",
        }),
        { params: Promise.resolve({ id: task.id }) }
      )
    );

    assert.equal(partial.outcome.outcome, "partial");
    assert.equal(partial.outcome.actualMinutes, 50);
    assert.equal(partial.task.done, false);
    assert.equal(partial.task.nextAction, "继续修改功能介绍部分");
    console.log("PASS V3.4 partial outcome keeps the task open with a next action");

    sqlite
      .prepare(
        "INSERT INTO users (id, username, password_hash, is_admin, created_at) VALUES (?, ?, ?, 0, ?)"
      )
      .run("user-b", "v34-user-b", "test-only", Date.now());
    const cookieB = `wtp_session=${createSession("user-b").token}`;
    await json(
      await taskRoute.POST(
        request("http://local/api/tasks", cookieB, "POST", {
          title: "只属于另一个账号的秘密任务",
        })
      )
    );

    const issued = await json<{ token: string }>(
      await assistantTokenRoute.POST(
        request("http://local/api/assistant-tokens", cookie, "POST", {
          name: "Grok",
          scopes: ["context:read", "tasks:write", "plans:write", "reviews:write", "templates:write"],
        })
      )
    );
    const readOnly = await json<{ token: string }>(
      await assistantTokenRoute.POST(
        request("http://local/api/assistant-tokens", cookie, "POST", {
          name: "Read only",
          scopes: ["context:read"],
        })
      )
    );
    const unauthorized = await assistantContextRoute.GET(
      assistantRequest("http://local/api/v1/assistant/context?from=2026-09-28&to=2026-10-04")
    );
    assert.equal(unauthorized.status, 401);
    const context = await json<{ tasks: { title: string }[] }>(
      await assistantContextRoute.GET(
        assistantRequest(
          "http://local/api/v1/assistant/context?from=2026-09-28&to=2026-10-04",
          issued.token
        )
      )
    );
    assert(context.tasks.some((item) => item.title === "修改首页文案"));
    assert(!context.tasks.some((item) => item.title.includes("秘密任务")));
    const forbiddenWrite = await externalTaskRoute.POST(
      assistantMutationRequest(
        "http://local/api/v1/tasks",
        readOnly.token,
        "POST",
        "read-only-write-001",
        { title: "不应创建" }
      )
    );
    assert.equal(forbiddenWrite.status, 401);
    console.log("PASS V3.4 assistant context is token-authenticated and tenant-isolated");

    const createBody = {
      title: "Grok确认后创建的任务",
      estimatedMinutes: 45,
      nextAction: "列出三个参考页面",
      originSource: "grok",
      originRef: "conversation:test-001",
    };
    const createdOnce = await json<{ id: string }>(
      await externalTaskRoute.POST(
        assistantMutationRequest(
          "http://local/api/v1/tasks",
          issued.token,
          "POST",
          "create-task-001",
          createBody
        )
      )
    );
    const createdReplay = await json<{ id: string }>(
      await externalTaskRoute.POST(
        assistantMutationRequest(
          "http://local/api/v1/tasks",
          issued.token,
          "POST",
          "create-task-001",
          createBody
        )
      )
    );
    assert.equal(createdReplay.id, createdOnce.id);
    const directCompletion = await externalTaskRoute.PATCH(
      assistantMutationRequest(
        "http://local/api/v1/tasks",
        issued.token,
        "PATCH",
        "direct-complete-001",
        { id: createdOnce.id, done: true }
      )
    );
    assert.equal(directCompletion.status, 400);
    const duplicateCount = sqlite
      .prepare("SELECT COUNT(*) AS count FROM tasks WHERE user_id = ? AND title = ?")
      .get("user-a", createBody.title) as { count: number };
    assert.equal(duplicateCount.count, 1);
    const conflict = await externalTaskRoute.POST(
      assistantMutationRequest(
        "http://local/api/v1/tasks",
        issued.token,
        "POST",
        "create-task-001",
        { ...createBody, title: "不能复用同一个键创建另一条任务" }
      )
    );
    assert.equal(conflict.status, 409);
    const audit = sqlite
      .prepare(
        "SELECT method, path, response_status FROM assistant_audit_events WHERE user_id = ? AND idempotency_key = ?"
      )
      .get("user-a", "create-task-001") as
      | { method: string; path: string; response_status: number }
      | undefined;
    assert.deepEqual(audit, {
      method: "POST",
      path: "/api/v1/tasks",
      response_status: 201,
    });
    console.log("PASS V3.4 assistant task creation is idempotent");
  } finally {
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error("FAIL V3.4 partial outcome keeps the task open with a next action");
  console.error(error);
  process.exitCode = 1;
});
