import { dashboardData } from "@/lib/server-store";
import { getUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
  const date =
    new URL(request.url).searchParams.get("date") ??
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(
      new Date()
    );
  return Response.json(dashboardData(auth.userId, date));
}
