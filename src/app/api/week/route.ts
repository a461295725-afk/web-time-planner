import { weekPlanData } from "@/lib/server-store";
import { shiftDate, todayKey, weekStartKey } from "@/lib/date";
import { getUserFromRequest } from "@/lib/auth";
import { isDateKey } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const requestedStart = new URL(request.url).searchParams.get("start");
  if (requestedStart && !isDateKey(requestedStart)) {
    return Response.json({ error: "周起始日期无效" }, { status: 400 });
  }
  const startDate = weekStartKey(requestedStart ?? todayKey());
  return Response.json({
    startDate,
    ...weekPlanData(auth.userId, startDate, shiftDate(startDate, 6)),
  });
}
