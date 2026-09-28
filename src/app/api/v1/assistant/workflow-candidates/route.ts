import { requireAssistantToken } from "@/lib/assistant-auth";
import { suggestWorkflowCandidates } from "@/lib/workflow-template-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireAssistantToken(request, "context:read");
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });
  return Response.json({ candidates: suggestWorkflowCandidates(auth.userId) });
}
