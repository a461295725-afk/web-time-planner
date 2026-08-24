import { getUserFromRequest } from "@/lib/auth";
import { todayKey } from "@/lib/date";
import { getStalledProjects } from "@/lib/review-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  try {
    const url = new URL(request.url);
    const asOf = url.searchParams.get("asOf") ?? todayKey();
    const rawDays = url.searchParams.get("days");
    const days = rawDays === null ? 7 : Number(rawDays);
    return Response.json({ asOf, days, items: getStalledProjects(auth.userId, asOf, days) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "停滞项目请求无效" },
      { status: 400 }
    );
  }
}
