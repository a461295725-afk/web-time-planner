import { createIdea, getIdeas } from "@/lib/server-store";
import { getUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  return Response.json(getIdeas(auth.userId));
}

export async function POST(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  return Response.json(createIdea(auth.userId), { status: 201 });
}
