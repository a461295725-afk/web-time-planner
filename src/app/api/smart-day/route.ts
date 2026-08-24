import { getUserFromRequest } from "@/lib/auth";
import {
  createDayPlanDraft,
  getSmartDaySnapshot,
  SmartDayError,
  smartDayErrorResponse,
} from "@/lib/smart-day-store";
import { todayKey } from "@/lib/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authOrResponse(request: Request) {
  const auth = getUserFromRequest(request);
  return auth ?? null;
}

export async function GET(request: Request) {
  const auth = authOrResponse(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  try {
    const date = new URL(request.url).searchParams.get("date") ?? todayKey();
    return Response.json(getSmartDaySnapshot(auth.userId, date));
  } catch (error) {
    return smartDayErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const auth = authOrResponse(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  try {
    const input = (await request.json()) as {
      date?: unknown;
      taskIds?: unknown;
      useAi?: unknown;
    };
    const taskIds =
      input.taskIds === undefined
        ? undefined
        : Array.isArray(input.taskIds) && input.taskIds.every((id) => typeof id === "string")
          ? input.taskIds
          : (() => {
              throw new SmartDayError("taskIds 无效");
            })();
    if (input.useAi !== undefined && typeof input.useAi !== "boolean") {
      throw new SmartDayError("useAi 无效");
    }
    return Response.json(
      await createDayPlanDraft(auth.userId, typeof input.date === "string" ? input.date : todayKey(), {
        taskIds,
        useAi: input.useAi as boolean | undefined,
      })
    );
  } catch (error) {
    return smartDayErrorResponse(error);
  }
}
