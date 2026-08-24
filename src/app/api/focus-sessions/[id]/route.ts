import { getUserFromRequest } from "@/lib/auth";
import {
  smartDayErrorResponse,
  stopFocusSession,
} from "@/lib/smart-day-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  try {
    const { id } = await params;
    const input = (await request.json()) as { action?: unknown };
    const action = input.action === undefined ? "stop" : input.action;
    if (action !== "stop" && action !== "cancel") {
      return Response.json({ error: "专注操作无效" }, { status: 400 });
    }
    return Response.json(stopFocusSession(auth.userId, id, action));
  } catch (error) {
    return smartDayErrorResponse(error);
  }
}
