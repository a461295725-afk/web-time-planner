import { requireAssistantToken } from "@/lib/assistant-auth";
import {
  AssistantIdempotencyError,
  idempotentResponse,
  runAssistantMutation,
} from "@/lib/assistant-idempotency";
import { parseJsonBody, requestJsonErrorResponse } from "@/lib/request-json";
import {
  applyWorkflowTemplate,
  WorkflowTemplateError,
} from "@/lib/workflow-template-store";

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
    const input = await parseJsonBody<Record<string, unknown>>(request, {
      requireJsonContentType: true,
    });
    return idempotentResponse(
      runAssistantMutation(request, auth, input, () => ({
        status: 201,
        body: applyWorkflowTemplate(auth.userId, id, input),
      }))
    );
  } catch (error) {
    const jsonError = requestJsonErrorResponse(error);
    if (jsonError) return jsonError;
    if (error instanceof AssistantIdempotencyError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof WorkflowTemplateError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "流程应用失败" },
      { status: 400 }
    );
  }
}
