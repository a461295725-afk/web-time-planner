import { dashboardData } from "@/lib/server-store";
import { getUserFromRequest } from "@/lib/auth";
import { isDateKey } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
  const requestedDate = new URL(request.url).searchParams.get("date");
  const date = requestedDate ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
  if (!isDateKey(date)) return Response.json({ error: "日期无效" }, { status: 400 });
  return Response.json(dashboardData(auth.userId, date));
}
