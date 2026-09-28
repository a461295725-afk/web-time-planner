import { requireAssistantToken } from "@/lib/assistant-auth";
import {
  AssistantIdempotencyError,
  idempotentResponse,
  runAssistantMutation,
} from "@/lib/assistant-idempotency";
import { applyWorkflowTemplate } from "@/lib/workflow-template-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAssistantToken(request, "templates:write");
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });
  try {
    const { id } = await params;
    const input = (await request.json()) as Record<string, unknown>;
    return idempotentResponse(
      runAssistantMutation(request, auth, input, () => ({
        status: 201,
        body: applyWorkflowTemplate(auth.userId, id, input),
      }))
    );
  } catch (error) {
    if (error instanceof AssistantIdempotencyError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "流程应用失败" },
      { status: 400 }
    );
  }
}
