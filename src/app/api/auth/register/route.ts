import { randomUUID } from "crypto";
import { sqlite } from "@/db";
import { hashPassword, getUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth || !auth.isAdmin) {
    return Response.json({ error: "仅管理员可创建用户" }, { status: 403 });
  }

  const body = await request.json();
  const username = (body.username ?? "").trim();
  const password = (body.password ?? "").trim();
  if (!username || !password || password.length < 6) {
    return Response.json(
      { error: "用户名不能为空，密码至少6位" },
      { status: 400 }
    );
  }

  const exists = sqlite
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(username);
  if (exists) {
    return Response.json({ error: "用户名已存在" }, { status: 409 });
  }

  const userId = randomUUID();
  const passwordHash = await hashPassword(password);
  sqlite
    .prepare(
      "INSERT INTO users (id, username, password_hash, is_admin, created_at) VALUES (?, ?, ?, 0, ?)"
    )
    .run(userId, username, passwordHash, Date.now());

  return Response.json({ ok: true, username, userId }, { status: 201 });
}
