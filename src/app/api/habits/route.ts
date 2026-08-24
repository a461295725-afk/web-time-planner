import {
  createHabit,
  deleteHabit,
  toggleHabit,
  updateHabit,
} from "@/lib/server-store";
import { getUserFromRequest } from "@/lib/auth";
import { isDateKey } from "@/lib/validation";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const input = await request.json();
  if (typeof input.id !== "string" || typeof input.date !== "string" || !isDateKey(input.date)) {
    return Response.json({ error: "打卡信息无效" }, { status: 400 });
  }
  return Response.json({
    checked: toggleHabit(auth.userId, input.id, input.date),
  });
}

export async function POST(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const input = await request.json();
  if (typeof input.name !== "string" || !input.name.trim()) {
    return Response.json({ error: "打卡项目名称不能为空" }, { status: 400 });
  }
  return Response.json(createHabit(auth.userId, input), { status: 201 });
}

export async function PUT(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const input = await request.json();
  if (
    typeof input.id !== "string" ||
    typeof input.date !== "string" ||
    !isDateKey(input.date) ||
    typeof input.name !== "string" ||
    !input.name.trim()
  ) {
    return Response.json({ error: "打卡项目信息无效" }, { status: 400 });
  }
  const habit = updateHabit(auth.userId, input.id, input, input.date);
  return habit
    ? Response.json(habit)
    : Response.json({ error: "打卡项目不存在" }, { status: 404 });
}

export async function DELETE(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const input = await request.json();
  if (typeof input.id !== "string") {
    return Response.json({ error: "缺少打卡项目 ID" }, { status: 400 });
  }
  return deleteHabit(auth.userId, input.id)
    ? Response.json({ ok: true })
    : Response.json({ error: "打卡项目不存在" }, { status: 404 });
}
