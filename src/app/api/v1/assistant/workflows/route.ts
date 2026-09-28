import { requireAssistantToken } from "@/lib/assistant-auth";
import {
  AssistantIdempotencyError,
  idempotentResponse,
  runAssistantMutation,
} from "@/lib/assistant-idempotency";
import {
  deleteWorkflowTemplate,
  listWorkflowTemplates,
  saveWorkflowTemplate,
} from "@/lib/workflow-template-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown): Response {
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
    const input = (await request.json()) as Record<string, unknown>;
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
  const auth = requireAssistantToken(request, "templates:write");
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });
  try {
    const input = (await request.json()) as Record<string, unknown>;
    if (typeof input.id !== "string") {
      return Response.json({ error: "缺少流程模板 ID" }, { status: 400 });
    }
    return idempotentResponse(
      runAssistantMutation(request, auth, input, () => {
        const deleted = deleteWorkflowTemplate(auth.userId, input.id as string);
        return deleted
          ? { status: 200, body: { ok: true } }
          : { status: 404, body: { error: "流程模板不存在" } };
      })
    );
  } catch (error) {
    return errorResponse(error);
  }
}
