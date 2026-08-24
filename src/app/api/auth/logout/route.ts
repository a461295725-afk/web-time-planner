import { deleteSession, clearSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    const token = cookieHeader
      .split("; ")
      .find((part) => part.startsWith("wtp_session="))
      ?.split("=")[1];
    if (token) deleteSession(token);
  }
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": "wtp_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" } }
  );
}
