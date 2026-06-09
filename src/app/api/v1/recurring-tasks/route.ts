import { requireHermesToken } from "@/lib/hermes-auth";
import {
  getRecurringTasks,
  createRecurringTask,
  deleteRecurringTask,
} from "@/lib/server-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = requireHermesToken(request);
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });
  return Response.json(getRecurringTasks(auth.userId));
}

export async function POST(request: Request) {
  const auth = requireHermesToken(request);
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });
  const input = await request.json();
  if (!input.title?.trim() || typeof input.dayOfMonth !== "number") {
    return Response.json({ error: "标题和日期必填" }, { status: 400 });
  }
  return Response.json(createRecurringTask(auth.userId, input), { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = requireHermesToken(request);
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });
  const { id } = await request.json();
  if (!id) return Response.json({ error: "缺少 ID" }, { status: 400 });
  return deleteRecurringTask(auth.userId, id)
    ? Response.json({ ok: true })
    : Response.json({ error: "不存在" }, { status: 404 });
}
