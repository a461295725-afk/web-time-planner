import { requireHermesToken } from "@/lib/hermes-auth";
import { dashboardData } from "@/lib/server-store";
import { todayKey } from "@/lib/date";
import { isDateKey } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = requireHermesToken(request);
  if (!auth) {
    return Response.json({ error: "未授权" }, { status: 401 });
  }
  const date =
    new URL(request.url).searchParams.get("date") ?? todayKey();
  if (!isDateKey(date)) return Response.json({ error: "日期无效" }, { status: 400 });
  const data = dashboardData(auth.userId, date);
  return Response.json({
    date,
    todayTasks: data.tasks
      .filter((t) => t.scheduledDate === date && !t.done)
      .map((t) => ({ id: t.id, title: t.title, priority: t.priority })),
    weekTasks: data.tasks
      .filter((t) => t.showInWeekPlan && !t.done)
      .map((t) => ({ id: t.id, title: t.title, priority: t.priority })),
    habits: data.habits.map((h) => ({
      id: h.id,
      name: h.name,
      checked: h.checked,
    })),
    todayDoneCount: data.tasks.filter(
      (t) => t.scheduledDate === date && t.done
    ).length,
  });
}
