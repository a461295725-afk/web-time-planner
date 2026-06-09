import { testAiConnection } from "@/lib/ai-service";
import { getUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  try {
    await testAiConnection(auth.userId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "AI 连接失败" },
      { status: 502 }
    );
  }
}
