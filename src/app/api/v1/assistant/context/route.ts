import { requireAssistantToken } from "@/lib/assistant-auth";
import { getAssistantContext } from "@/lib/assistant-context-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireAssistantToken(request, "context:read");
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });
  try {
    const params = new URL(request.url).searchParams;
    return Response.json(
      getAssistantContext(auth.userId, params.get("from"), params.get("to"))
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "助手上下文请求无效" },
      { status: 400 }
    );
  }
}
