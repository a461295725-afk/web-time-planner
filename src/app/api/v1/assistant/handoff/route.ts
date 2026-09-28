import { requireAssistantToken } from "@/lib/assistant-auth";
import { buildAssistantHandoff } from "@/lib/assistant-review-store";
import { todayKey } from "@/lib/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireAssistantToken(request, "context:read");
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });
  try {
    const params = new URL(request.url).searchParams;
    const date = params.get("date") ?? todayKey();
    const kind = params.get("kind") ?? "morning";
    if (kind !== "morning" && kind !== "evening") {
      return Response.json({ error: "交接类型无效" }, { status: 400 });
    }
    return Response.json(buildAssistantHandoff(auth.userId, date, kind));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "交接摘要生成失败" },
      { status: 400 }
    );
  }
}
