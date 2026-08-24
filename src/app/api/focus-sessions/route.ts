import { getUserFromRequest } from "@/lib/auth";
import {
  getFocusSessions,
  smartDayErrorResponse,
  startFocusSession,
} from "@/lib/smart-day-store";
import { todayKey } from "@/lib/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  try {
    const date = new URL(request.url).searchParams.get("date") ?? todayKey();
    return Response.json(getFocusSessions(auth.userId, date));
  } catch (error) {
    return smartDayErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  try {
    const input = (await request.json()) as {
      taskId?: unknown;
      planItemId?: unknown;
      date?: unknown;
    };
    if (input.taskId !== undefined && typeof input.taskId !== "string") {
      return Response.json({ error: "任务 ID 无效" }, { status: 400 });
    }
    if (input.planItemId !== undefined && typeof input.planItemId !== "string") {
      return Response.json({ error: "计划项 ID 无效" }, { status: 400 });
    }
    if (input.date !== undefined && typeof input.date !== "string") {
      return Response.json({ error: "日期无效" }, { status: 400 });
    }
    return Response.json(
      startFocusSession(auth.userId, {
        taskId: input.taskId,
        planItemId: input.planItemId,
        date: input.date,
      }),
      { status: 201 }
    );
  } catch (error) {
    return smartDayErrorResponse(error);
  }
}
