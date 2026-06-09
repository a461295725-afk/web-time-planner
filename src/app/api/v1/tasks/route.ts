import { requireHermesToken } from "@/lib/hermes-auth";
import {
  createTask,
  getTasks,
  updateTask,
  deleteTask,
} from "@/lib/server-store";
import { todayKey } from "@/lib/date";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = requireHermesToken(request);
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });

  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  const projectId = url.searchParams.get("projectId");
  const all = getTasks(auth.userId);

  let tasks = all;
  if (date) {
    tasks = tasks.filter((t) => t.scheduledDate === date);
  }
  if (projectId) {
    tasks = tasks.filter((t) => t.projectId === projectId);
  }

  return Response.json(
    tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      priority: t.priority,
      done: t.done,
      dueDate: t.dueDate,
      scheduledDate: t.scheduledDate,
      projectId: t.projectId,
      showInWeekPlan: t.showInWeekPlan,
    }))
  );
}

export async function POST(request: Request) {
  const auth = requireHermesToken(request);
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });

  const input = await request.json();
  const title = (input.title ?? "").trim();
  if (!title) {
    return Response.json({ error: "任务标题不能为空" }, { status: 400 });
  }

  const task = createTask(auth.userId, {
    title,
    description: input.description,
    priority: input.priority,
    scheduledDate: input.scheduledDate,
    dueDate: input.scheduledDate ?? input.dueDate,
    projectId: input.projectId,
    showInWeekPlan: input.showInWeekPlan,
  });

  return Response.json(task, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = requireHermesToken(request);
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });

  const input = await request.json();
  if (typeof input.id !== "string") {
    return Response.json({ error: "缺少任务 ID" }, { status: 400 });
  }

  const updated = updateTask(auth.userId, input.id, {
    title: input.title,
    description: input.description,
    priority: input.priority,
    done: input.done,
    scheduledDate: input.scheduledDate,
    dueDate: input.dueDate,
    showInWeekPlan: input.showInWeekPlan,
  });

  return updated
    ? Response.json(updated)
    : Response.json({ error: "任务不存在" }, { status: 404 });
}

export async function DELETE(request: Request) {
  const auth = requireHermesToken(request);
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });

  const input = await request.json();
  if (typeof input.id !== "string") {
    return Response.json({ error: "缺少任务 ID" }, { status: 400 });
  }

  return deleteTask(auth.userId, input.id)
    ? Response.json({ ok: true })
    : Response.json({ error: "任务不存在" }, { status: 404 });
}
