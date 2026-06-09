import {
  getRecurringTasks,
  createRecurringTask,
  updateRecurringTask,
  deleteRecurringTask,
} from "@/lib/server-store";
import { getUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  return Response.json(getRecurringTasks(auth.userId));
}

export async function POST(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const input = await request.json();
  if (!input.title?.trim() || typeof input.dayOfMonth !== "number" || input.dayOfMonth < 1 || input.dayOfMonth > 31) {
    return Response.json({ error: "标题不能为空，日期需在 1-31 之间" }, { status: 400 });
  }
  return Response.json(createRecurringTask(auth.userId, input), { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const input = await request.json();
  if (typeof input.id !== "string") {
    return Response.json({ error: "缺少 ID" }, { status: 400 });
  }
  const updated = updateRecurringTask(auth.userId, input.id, input);
  return updated ? Response.json(updated) : Response.json({ error: "不存在" }, { status: 404 });
}

export async function DELETE(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const input = await request.json();
  if (typeof input.id !== "string") {
    return Response.json({ error: "缺少 ID" }, { status: 400 });
  }
  return deleteRecurringTask(auth.userId, input.id)
    ? Response.json({ ok: true })
    : Response.json({ error: "不存在" }, { status: 404 });
}
