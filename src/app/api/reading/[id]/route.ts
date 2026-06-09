import { deleteReadingItem, toggleReadingItem } from "@/lib/server-store";
import { getUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const input = await request.json();
  const item = toggleReadingItem(auth.userId, id, Boolean(input.isRead));
  return item
    ? Response.json(item)
    : Response.json({ error: "收藏不存在" }, { status: 404 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  deleteReadingItem(auth.userId, id);
  return Response.json({ ok: true });
}
