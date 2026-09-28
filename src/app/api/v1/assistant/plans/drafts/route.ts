import { requireAssistantToken } from "@/lib/assistant-auth";
import {
  AssistantIdempotencyError,
  idempotentResponse,
  runAssistantMutationAsync,
} from "@/lib/assistant-idempotency";
import { todayKey } from "@/lib/date";
import { createDayPlanDraft, smartDayErrorResponse } from "@/lib/smart-day-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = requireAssistantToken(request, "plans:write");
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });
  try {
    const input = (await request.json()) as Record<string, unknown>;
    if (
      input.taskIds !== undefined &&
      (!Array.isArray(input.taskIds) || input.taskIds.some((id) => typeof id !== "string"))
    ) {
      return Response.json({ error: "taskIds 无效" }, { status: 400 });
    }
    if (input.useAi !== undefined && typeof input.useAi !== "boolean") {
      return Response.json({ error: "useAi 无效" }, { status: 400 });
    }
    const result = await runAssistantMutationAsync(request, auth, input, async () => ({
      status: 201,
      body: await createDayPlanDraft(
        auth.userId,
        typeof input.date === "string" ? input.date : todayKey(),
        {
          taskIds: input.taskIds as string[] | undefined,
          useAi: input.useAi as boolean | undefined,
        }
      ),
    }));
    return idempotentResponse(result);
  } catch (error) {
    if (error instanceof AssistantIdempotencyError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return smartDayErrorResponse(error);
  }
}
