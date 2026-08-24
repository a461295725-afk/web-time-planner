import { getUserFromRequest } from "@/lib/auth";
import { shiftDate, todayKey } from "@/lib/date";
import { getReviewStats } from "@/lib/review-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  try {
    const url = new URL(request.url);
    const to = url.searchParams.get("to") ?? todayKey();
    const from = url.searchParams.get("from") ?? shiftDate(to, -6);
    return Response.json(getReviewStats(auth.userId, from, to));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "统计请求无效" },
      { status: 400 }
    );
  }
}
