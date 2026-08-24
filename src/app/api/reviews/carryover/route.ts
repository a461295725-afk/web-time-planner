import { getUserFromRequest } from "@/lib/auth";
import { applyCarryover } from "@/lib/review-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  try {
    const input = await request.json();
    if (typeof input?.sourceDate !== "string" || typeof input?.targetDate !== "string") {
      return Response.json({ error: "缺少结转来源或目标日期" }, { status: 400 });
    }
    return Response.json(applyCarryover(auth.userId, input.sourceDate, input.targetDate));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "结转请求无效" },
      { status: 400 }
    );
  }
}
