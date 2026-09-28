import { requireAssistantToken } from "@/lib/assistant-auth";
import {
  AssistantIdempotencyError,
  idempotentResponse,
  runAssistantMutationAsync,
} from "@/lib/assistant-idempotency";
import { todayKey } from "@/lib/date";
import { parseJsonBody, requestJsonErrorResponse } from "@/lib/request-json";
import { createDayPlanDraft, smartDayErrorResponse } from "@/lib/smart-day-store";
import { isDateKey } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = requireAssistantToken(request, "plans:write");
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });
  try {
    const input = await parseJsonBody<Record<string, unknown>>(request, {
      requireJsonContentType: true,
    });
    if (input.date !== undefined && !isDateKey(input.date)) {
      return Response.json({ error: "date 日期无效" }, { status: 400 });
    }
    if (
      input.taskIds !== undefined &&
      (!Array.isArray(input.taskIds) || input.taskIds.some((id) => typeof id !== "string"))
    ) {
      return Response.json({ error: "taskIds 无效" }, { status: 400 });
    }
    if (input.useAi !== undefined && typeof input.useAi !== "boolean") {
      return Response.json({ error: "useAi 无效" }, { status: 400 });
    }
    if (input.replaceConfirmed !== undefined && typeof input.replaceConfirmed !== "boolean") {
      return Response.json({ error: "replaceConfirmed 无效" }, { status: 400 });
    }
    const result = await runAssistantMutationAsync(request, auth, input, async () => ({
      status: 201,
      body: await createDayPlanDraft(
        auth.userId,
        input.date === undefined ? todayKey() : (input.date as string),
        {
          taskIds: input.taskIds as string[] | undefined,
          useAi: input.useAi as boolean | undefined,
          replaceConfirmed: input.replaceConfirmed as boolean | undefined,
        }
      ),
    }));
    return idempotentResponse(result);
  } catch (error) {
    const jsonError = requestJsonErrorResponse(error);
    if (jsonError) return jsonError;
    if (error instanceof AssistantIdempotencyError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return smartDayErrorResponse(error);
  }
}
