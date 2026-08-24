import { requireHermesToken } from "@/lib/hermes-auth";
import {
  getReadingItems,
  upsertReadingItem,
  deleteReadingItem,
} from "@/lib/server-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = requireHermesToken(request);
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });

  return Response.json(getReadingItems(auth.userId));
}

export async function POST(request: Request) {
  const auth = requireHermesToken(request);
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });

  const input = await request.json();
  if (typeof input.url !== "string" || !input.url.trim()) {
    return Response.json({ error: "链接不能为空" }, { status: 400 });
  }
  try {
    const result = upsertReadingItem(auth.userId, input);
    return Response.json(result, { status: result.existed ? 200 : 201 });
  } catch {
    return Response.json({ error: "链接格式无效" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const auth = requireHermesToken(request);
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });

  const { id } = await request.json();
  if (!id) return Response.json({ error: "缺少阅读项 ID" }, { status: 400 });
  return deleteReadingItem(auth.userId, id)
    ? Response.json({ ok: true })
    : Response.json({ error: "收藏不存在" }, { status: 404 });
}
