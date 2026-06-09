import { deleteIdea, updateIdea } from "@/lib/server-store";
import { getUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const idea = updateIdea(auth.userId, id, await request.json());
  return idea
    ? Response.json(idea)
    : Response.json({ error: "想法不存在" }, { status: 404 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  deleteIdea(auth.userId, id);
  return Response.json({ ok: true });
}
