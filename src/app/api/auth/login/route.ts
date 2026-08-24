import { sqlite } from "@/db";
import {
  verifyPassword,
  createSession,
  sessionCookieString,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json();
  const username = (body.username ?? "").trim();
  const password = (body.password ?? "").trim();
  if (!username || !password) {
    return Response.json(
      { error: "用户名和密码不能为空" },
      { status: 400 }
    );
  }

  const user = sqlite
    .prepare("SELECT id, password_hash FROM users WHERE username = ?")
    .get(username) as { id: string; password_hash: string } | undefined;
  if (!user) {
    return Response.json({ error: "用户名或密码错误" }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return Response.json({ error: "用户名或密码错误" }, { status: 401 });
  }

  const session = createSession(user.id);

  return Response.json(
    { ok: true, username },
    {
      headers: { "Set-Cookie": sessionCookieString(session.token) },
    }
  );
}
