import { getUserFromRequest } from "@/lib/auth";
import {
  CaptureSearchInputError,
  getTaskDetail,
  updateTaskDetail,
} from "@/lib/capture-search-store";
import { todayKey } from "@/lib/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const task = getTaskDetail(auth.userId, id);
  return task
    ? Response.json(task)
    : Response.json({ error: "任务不存在" }, { status: 404 });
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  try {
    const { id } = await params;
    const input = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new CaptureSearchInputError("任务参数无效");
    }
    const task = updateTaskDetail(auth.userId, id, {
      action: input.action,
      date: input.date ?? (input.action === "today" ? todayKey() : undefined),
      title: input.title,
      description: input.description,
    });
    return task
      ? Response.json(task)
      : Response.json({ error: "任务不存在" }, { status: 404 });
  } catch (error) {
    if (error instanceof CaptureSearchInputError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "任务参数无效" }, { status: 400 });
    }
    return Response.json({ error: "任务更新失败" }, { status: 500 });
  }
}
