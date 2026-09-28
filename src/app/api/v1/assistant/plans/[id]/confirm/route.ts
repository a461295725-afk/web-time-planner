import { requireAssistantToken } from "@/lib/assistant-auth";
import {
  AssistantIdempotencyError,
  idempotentResponse,
  runAssistantMutation,
} from "@/lib/assistant-idempotency";
import { parseJsonBody, requestJsonErrorResponse } from "@/lib/request-json";
import { confirmSmartDayPlan, smartDayErrorResponse } from "@/lib/smart-day-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAssistantToken(request, "plans:write");
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });
  try {
    const { id } = await params;
    const input = await parseJsonBody<Record<string, unknown>>(request, {
      requireJsonContentType: true,
    });
    return idempotentResponse(
      runAssistantMutation(request, auth, input, () => ({
        status: 200,
        body: confirmSmartDayPlan(auth.userId, id),
      }))
    );
  } catch (error) {
    const jsonError = requestJsonErrorResponse(error);
    if (jsonError) return jsonError;
    if (error instanceof AssistantIdempotencyError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return smartDayErrorResponse(error);
  }
}
