import { requireAssistantToken } from "@/lib/assistant-auth";
import {
  AssistantIdempotencyError,
  idempotentResponse,
  runAssistantMutation,
} from "@/lib/assistant-idempotency";
import { smartDayErrorResponse, updateSmartDayItem } from "@/lib/smart-day-store";
import type { SmartDayItemActionInput } from "@/lib/smart-day-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAssistantToken(request, "plans:write");
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });
  try {
    const { id } = await params;
    const input = (await request.json()) as SmartDayItemActionInput;
    return idempotentResponse(
      runAssistantMutation(request, auth, input, () => ({
        status: 200,
        body: updateSmartDayItem(auth.userId, id, input),
      }))
    );
  } catch (error) {
    if (error instanceof AssistantIdempotencyError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return smartDayErrorResponse(error);
  }
}
