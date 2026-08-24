import { getUserFromRequest } from "@/lib/auth";
import { todayKey } from "@/lib/date";
import { createDayPlanDraft, smartDayErrorResponse } from "@/lib/smart-day-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  try {
    const input = (await request.json()) as {
      date?: unknown;
      taskIds?: unknown;
      useAi?: unknown;
    };
    if (
      input.taskIds !== undefined &&
      (!Array.isArray(input.taskIds) || input.taskIds.some((id) => typeof id !== "string"))
    ) {
      return Response.json({ error: "taskIds 无效" }, { status: 400 });
    }
    if (input.useAi !== undefined && typeof input.useAi !== "boolean") {
      return Response.json({ error: "useAi 无效" }, { status: 400 });
    }
    return Response.json(
      await createDayPlanDraft(auth.userId, typeof input.date === "string" ? input.date : todayKey(), {
        taskIds: input.taskIds as string[] | undefined,
        useAi: input.useAi as boolean | undefined,
      })
    );
  } catch (error) {
    return smartDayErrorResponse(error);
  }
}
