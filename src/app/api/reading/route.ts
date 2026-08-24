import { getReadingItems, upsertReadingItem } from "@/lib/server-store";
import { getUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  return Response.json(getReadingItems(auth.userId));
}

export async function POST(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const input = await request.json();
  if (typeof input.url !== "string" || !input.url.trim()) {
    return Response.json({ error: "请输入文章链接" }, { status: 400 });
  }
  try {
    const result = upsertReadingItem(auth.userId, input);
    return Response.json(result, { status: result.existed ? 200 : 201 });
  } catch {
    return Response.json({ error: "链接格式无效" }, { status: 400 });
  }
}
