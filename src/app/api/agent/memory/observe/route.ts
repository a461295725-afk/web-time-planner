import { getUserFromRequest } from "@/lib/auth";
import { observeMemories } from "@/lib/memory-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  try {
    return Response.json(observeMemories(auth.userId));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "记忆观察失败" },
      { status: 400 }
    );
  }
}
