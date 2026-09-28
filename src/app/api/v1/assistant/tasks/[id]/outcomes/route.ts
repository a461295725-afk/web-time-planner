import { requireAssistantToken } from "@/lib/assistant-auth";
import {
  AssistantIdempotencyError,
  idempotentResponse,
  runAssistantMutation,
} from "@/lib/assistant-idempotency";
import { parseJsonBody, requestJsonErrorResponse } from "@/lib/request-json";
import {
  listTaskOutcomes,
  recordTaskOutcome,
  TaskExecutionError,
  type TaskOutcomeKind,
} from "@/lib/task-execution-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function errorResponse(error: unknown): Response {
  const jsonError = requestJsonErrorResponse(error);
  if (jsonError) return jsonError;
  if (error instanceof TaskExecutionError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof AssistantIdempotencyError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json(
    { error: error instanceof Error ? error.message : "任务结果无效" },
    { status: 400 }
  );
}

export async function GET(request: Request, { params }: Params) {
  const auth = requireAssistantToken(request, "context:read");
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });
  try {
    const { id } = await params;
    return Response.json({ outcomes: listTaskOutcomes(auth.userId, id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  const auth = requireAssistantToken(request, "tasks:write");
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });
  try {
    const { id } = await params;
    const input = await parseJsonBody<Record<string, unknown>>(request, {
      requireJsonContentType: true,
    });
    return idempotentResponse(
      runAssistantMutation(request, auth, input, () => ({
        status: 201,
        body: recordTaskOutcome(auth.userId, id, {
          date: input.date as string,
          outcome: input.outcome as TaskOutcomeKind,
          note: input.note as string | undefined,
          nextAction: input.nextAction as string | undefined,
          actualMinutes: input.actualMinutes as number | undefined,
          rescheduleDate: input.rescheduleDate as string | undefined,
          waitingOn: input.waitingOn as string | undefined,
          followUpDate: input.followUpDate as string | undefined,
          blocker: input.blocker as string | undefined,
          source: `assistant:${auth.name}`,
        }),
      }))
    );
  } catch (error) {
    return errorResponse(error);
  }
}
