import { requireHermesToken } from "@/lib/hermes-auth";
import { getHabits, createHabit, deleteHabit } from "@/lib/server-store";
import { todayKey } from "@/lib/date";
import { isDateKey } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = requireHermesToken(request);
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });

  const date =
    new URL(request.url).searchParams.get("date") ?? todayKey();
  if (!isDateKey(date)) return Response.json({ error: "日期无效" }, { status: 400 });
  return Response.json(getHabits(auth.userId, date));
}

export async function POST(request: Request) {
  const auth = requireHermesToken(request);
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });

  const input = await request.json();
  const name = (input.name ?? "").trim();
  if (!name) {
    return Response.json({ error: "习惯名称不能为空" }, { status: 400 });
  }

  const habit = createHabit(auth.userId, {
    name,
    icon: input.icon ?? "clipboard-check",
  });
  return Response.json(habit, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = requireHermesToken(request);
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });

  const { id } = await request.json();
  if (!id) return Response.json({ error: "缺少习惯 ID" }, { status: 400 });
  return deleteHabit(auth.userId, id)
    ? Response.json({ ok: true })
    : Response.json({ error: "习惯不存在" }, { status: 404 });
}
