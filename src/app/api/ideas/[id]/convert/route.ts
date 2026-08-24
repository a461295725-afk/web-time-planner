import { convertIdea } from "@/lib/server-store";
import { getUserFromRequest } from "@/lib/auth";
import { isDateKey } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const input = await request.json();
  if (
    (input.kind !== "task" && input.kind !== "project") ||
    typeof input.date !== "string" ||
    !isDateKey(input.date)
  ) {
    return Response.json({ error: "转换类型无效" }, { status: 400 });
  }
  const result = convertIdea(auth.userId, id, input.kind, input.date);
  return result
    ? Response.json(result)
    : Response.json({ error: "请先填写想法标题" }, { status: 400 });
}
