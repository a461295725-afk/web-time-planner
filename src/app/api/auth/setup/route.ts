import { sqlite } from "@/db";
import { randomUUID } from "crypto";
import { hashPassword, createSession, sessionCookieString } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const userCount = (
    sqlite.prepare("SELECT COUNT(*) as count FROM users").get() as {
      count: number;
    }
  ).count;
  if (userCount > 0) {
    return Response.json({ error: "系统已完成初始化" }, { status: 403 });
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

  const userId = randomUUID();
  const passwordHash = await hashPassword(password);
  sqlite
    .prepare(
      "INSERT INTO users (id, username, password_hash, is_admin, created_at) VALUES (?, ?, ?, 1, ?)"
    )
    .run(userId, username, passwordHash, Date.now());

  const session = createSession(userId);

  return Response.json(
    { ok: true, username },
    {
      status: 201,
      headers: { "Set-Cookie": sessionCookieString(session.token) },
    }
  );
}
