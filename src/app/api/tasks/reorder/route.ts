import { reorderTasks } from "@/lib/server-store";
import { getUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const input = await request.json();
  if (
    !Array.isArray(input.ids) ||
    input.ids.some((id: unknown) => typeof id !== "string")
  ) {
    return Response.json({ error: "任务顺序无效" }, { status: 400 });
  }
  if (
    input.scope !== undefined &&
    input.scope !== "today" &&
    input.scope !== "scheduled" &&
    input.scope !== "default"
  ) {
    return Response.json({ error: "任务顺序范围无效" }, { status: 400 });
  }
  if (!reorderTasks(auth.userId, input.ids, input.scope ?? "default")) {
    return Response.json({ error: "任务不属于当前用户或顺序为空" }, { status: 400 });
  }
  return Response.json({ ok: true });
}
