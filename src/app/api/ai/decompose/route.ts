import { generateTaskBreakdown } from "@/lib/ai-service";
import { getUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const input = await request.json();
  if (typeof input.title !== "string" || !input.title.trim()) {
    return Response.json({ error: "请先填写项目名称" }, { status: 400 });
  }
  try {
    const note = typeof input.note === "string" ? input.note : "";
    const tasks = await generateTaskBreakdown(
      input.title.trim(),
      note,
      auth.userId
    );
    return Response.json({ tasks });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "AI 拆分失败" },
      { status: 502 }
    );
  }
}
