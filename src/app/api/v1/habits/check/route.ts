import { requireHermesToken } from "@/lib/hermes-auth";
import { getHabits, toggleHabit } from "@/lib/server-store";
import { todayKey } from "@/lib/date";
import { isDateKey } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = requireHermesToken(request);
  if (!auth) {
    return Response.json({ error: "未授权" }, { status: 401 });
  }

  const input = await request.json();
  const name = (input.name ?? "").trim();
  const id = (input.id ?? "").trim();
  if (!name && !id) {
    return Response.json(
      { error: "请提供习惯名称（name）或 ID（id）" },
      { status: 400 }
    );
  }

  const date = input.date ?? todayKey();
  if (!isDateKey(date)) return Response.json({ error: "日期无效" }, { status: 400 });
  const { habits } = getHabits(auth.userId, date);

  const habit = id
    ? habits.find((h) => h.id === id)
    : habits.find((h) => h.name === name);

  if (!habit) {
    return Response.json({ error: "未找到该打卡习惯" }, { status: 404 });
  }

  const checked = toggleHabit(auth.userId, habit.id, date);
  return Response.json({
    habit: { id: habit.id, name: habit.name },
    date,
    checked,
  });
}
