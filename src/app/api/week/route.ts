import { weekPlanData } from "@/lib/server-store";
import { shiftDate, todayKey, weekStartKey } from "@/lib/date";
import { getUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const requestedStart = new URL(request.url).searchParams.get("start");
  const startDate =
    requestedStart && /^\d{4}-\d{2}-\d{2}$/.test(requestedStart)
      ? weekStartKey(requestedStart)
      : weekStartKey(todayKey());
  return Response.json({
    startDate,
    ...weekPlanData(auth.userId, startDate, shiftDate(startDate, 6)),
  });
}
