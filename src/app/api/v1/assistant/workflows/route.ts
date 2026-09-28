import {
  forbidAssistantDelete,
  requireAssistantToken,
} from "@/lib/assistant-auth";
import {
  AssistantIdempotencyError,
  idempotentResponse,
  runAssistantMutation,
} from "@/lib/assistant-idempotency";
import { parseJsonBody, requestJsonErrorResponse } from "@/lib/request-json";
import {
  listWorkflowTemplates,
  saveWorkflowTemplate,
} from "@/lib/workflow-template-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown): Response {
  const jsonError = requestJsonErrorResponse(error);
  if (jsonError) return jsonError;
  if (error instanceof AssistantIdempotencyError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json(
    { error: error instanceof Error ? error.message : "流程模板请求无效" },
    { status: 400 }
  );
}

export async function GET(request: Request) {
  const auth = requireAssistantToken(request, "context:read");
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });
  return Response.json({ templates: listWorkflowTemplates(auth.userId) });
}

export async function POST(request: Request) {
  const auth = requireAssistantToken(request, "templates:write");
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });
  try {
    const input = await parseJsonBody<Record<string, unknown>>(request, {
      requireJsonContentType: true,
    });
    return idempotentResponse(
      runAssistantMutation(request, auth, input, () => ({
        status: 201,
        body: saveWorkflowTemplate(auth.userId, {
          name: input.name,
          description: input.description,
          steps: input.steps,
          source: `assistant:${auth.name}`,
        }),
      }))
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const forbidden = forbidAssistantDelete(request);
  return forbidden ?? Response.json({ error: "未授权" }, { status: 401 });
}
