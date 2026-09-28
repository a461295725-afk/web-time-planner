import { requireHermesToken } from "@/lib/hermes-auth";
import {
  forbidAssistantDelete,
  requireAssistantToken,
} from "@/lib/assistant-auth";
import {
  AssistantIdempotencyError,
  idempotentResponse,
  runAssistantMutation,
} from "@/lib/assistant-idempotency";
import { parseJsonBody, requestJsonErrorResponse } from "@/lib/request-json";
import {
  createTask,
  getTasks,
  updateTask,
  deleteTask,
} from "@/lib/server-store";
import { todayKey } from "@/lib/date";
import { isDateKey, isPriority, validateTaskFields } from "@/lib/validation";

export const runtime = "nodejs";

type TaskCreateRequest = Parameters<typeof createTask>[1];
type TaskUpdateRequest = Parameters<typeof updateTask>[2] & { id?: unknown };

function taskPayload(t: ReturnType<typeof getTasks>[number]) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    priority: t.priority,
    done: t.done,
    dueDate: t.dueDate,
    scheduledDate: t.scheduledDate,
    projectId: t.projectId,
    showInWeekPlan: t.showInWeekPlan,
    estimatedMinutes: t.estimatedMinutes,
    energyLevel: t.energyLevel,
    preferredPeriod: t.preferredPeriod,
    executionState: t.executionState,
    nextAction: t.nextAction,
    doneDefinition: t.doneDefinition,
    waitingOn: t.waitingOn,
    followUpDate: t.followUpDate,
    blocker: t.blocker,
    taskLevel: t.taskLevel,
    parentTaskId: t.parentTaskId,
    originSource: t.originSource,
    originRef: t.originRef,
    completionOutcome: t.completionOutcome,
    lastOutcomeAt: t.lastOutcomeAt,
  };
}

function errorResponse(error: unknown): Response {
  const jsonError = requestJsonErrorResponse(error);
  if (jsonError) return jsonError;
  if (error instanceof AssistantIdempotencyError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json(
    { error: error instanceof Error ? error.message : "任务请求无效" },
    { status: 400 }
  );
}

export async function GET(request: Request) {
  const assistant = requireAssistantToken(request, "context:read");
  const auth = assistant ?? requireHermesToken(request);
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });

  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  const projectId = url.searchParams.get("projectId");
  const all = getTasks(auth.userId);

  let tasks = all;
  if (date) {
    if (!isDateKey(date)) return Response.json({ error: "日期无效" }, { status: 400 });
    tasks = tasks.filter((t) => t.scheduledDate === date);
  }
  if (projectId) {
    tasks = tasks.filter((t) => t.projectId === projectId);
  }

  return Response.json(
    tasks.map(taskPayload)
  );
}

export async function POST(request: Request) {
  const assistant = requireAssistantToken(request, "tasks:write");
  const auth = assistant ?? requireHermesToken(request);
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });
  try {
    const input = await parseJsonBody<TaskCreateRequest>(request, {
      requireJsonContentType: Boolean(assistant),
    });
    const taskValidationError = validateTaskFields(input, { requireTitle: true });
    if (taskValidationError) {
      return Response.json({ error: taskValidationError }, { status: 400 });
    }
    const title = (input.title ?? "").trim();
    if (!title) return Response.json({ error: "任务标题不能为空" }, { status: 400 });
    if (input.priority !== undefined && !isPriority(input.priority)) {
      return Response.json({ error: "优先级无效" }, { status: 400 });
    }
    for (const field of ["dueDate", "scheduledDate", "followUpDate"] as const) {
      if (input[field] !== undefined && input[field] !== null && input[field] !== "" && !isDateKey(input[field])) {
        return Response.json({ error: `${field} 日期无效` }, { status: 400 });
      }
    }
    const create = () => ({
      status: 201,
      body: taskPayload(
        createTask(auth.userId, {
          ...input,
          title,
          dueDate: input.scheduledDate ?? input.dueDate,
          originSource: assistant
            ? `assistant:${assistant.name}`
            : input.originSource ?? "hermes",
        })
      ),
    });
    return assistant
      ? idempotentResponse(runAssistantMutation(request, assistant, input, create))
      : Response.json(create().body, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const assistant = requireAssistantToken(request, "tasks:write");
  const auth = assistant ?? requireHermesToken(request);
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });

  try {
    const input = await parseJsonBody<TaskUpdateRequest>(request, {
      requireJsonContentType: Boolean(assistant),
    });
    const taskValidationError = validateTaskFields(input);
    if (taskValidationError) {
      return Response.json({ error: taskValidationError }, { status: 400 });
    }
    const taskId = input.id;
    if (typeof taskId !== "string") {
      return Response.json({ error: "缺少任务 ID" }, { status: 400 });
    }
    if (assistant && input.done !== undefined) {
      return Response.json(
        { error: "外部助手请通过 outcomes 接口记录完成、部分完成、推迟或放弃" },
        { status: 400 }
      );
    }
    if (input.priority !== undefined && !isPriority(input.priority)) {
      return Response.json({ error: "优先级无效" }, { status: 400 });
    }
    for (const field of ["dueDate", "scheduledDate", "followUpDate"] as const) {
      if (input[field] !== undefined && input[field] !== null && input[field] !== "" && !isDateKey(input[field])) {
        return Response.json({ error: `${field} 日期无效` }, { status: 400 });
      }
    }
    const update = () => {
      const updates = { ...input };
      if (assistant) delete updates.originSource;
      const updated = updateTask(auth.userId, taskId, updates);
      return updated
        ? { status: 200, body: taskPayload(updated) }
        : { status: 404, body: { error: "任务不存在" } };
    };
    if (assistant) {
      return idempotentResponse(runAssistantMutation(request, assistant, input, update));
    }
    const result = update();
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const forbidden = forbidAssistantDelete(request);
  if (forbidden) return forbidden;

  const auth = requireHermesToken(request);
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });

  try {
    const input = await parseJsonBody<{ id?: unknown }>(request);
    const taskId = input.id;
    if (typeof taskId !== "string") {
      return Response.json({ error: "缺少任务 ID" }, { status: 400 });
    }
    const remove = () =>
      deleteTask(auth.userId, taskId)
        ? { status: 200, body: { ok: true } }
        : { status: 404, body: { error: "任务不存在" } };
    const result = remove();
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    return errorResponse(error);
  }
}
