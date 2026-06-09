import {
  createTask,
  deleteTask,
  getTasks,
  updateTask,
} from "@/lib/server-store";
import { getUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  return Response.json(getTasks(auth.userId));
}

export async function POST(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const input = await request.json();
  if (typeof input.title !== "string" || !input.title.trim()) {
    return Response.json({ error: "任务标题不能为空" }, { status: 400 });
  }
  return Response.json(createTask(auth.userId, input), { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const input = await request.json();
  if (typeof input.id !== "string") {
    return Response.json({ error: "缺少任务 ID" }, { status: 400 });
  }
  const task = updateTask(auth.userId, input.id, input);
  return task
    ? Response.json(task)
    : Response.json({ error: "任务不存在" }, { status: 404 });
}

export async function DELETE(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const input = await request.json();
  if (typeof input.id !== "string") {
    return Response.json({ error: "缺少任务 ID" }, { status: 400 });
  }
  return deleteTask(auth.userId, input.id)
    ? Response.json({ ok: true })
    : Response.json({ error: "任务不存在" }, { status: 404 });
}
