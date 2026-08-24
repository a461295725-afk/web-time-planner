import { getUserFromRequest } from "@/lib/auth";
import { confirmMemory, deleteMemory, getMemory, updateMemory } from "@/lib/memory-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function errorResponse(error: unknown): Response {
  return Response.json(
    { error: error instanceof Error ? error.message : "记忆请求无效" },
    { status: 400 }
  );
}

export async function GET(request: Request, { params }: Params) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const memory = getMemory(auth.userId, id);
  return memory ? Response.json(memory) : Response.json({ error: "记忆不存在" }, { status: 404 });
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  try {
    const { id } = await params;
    const input = await request.json();
    if (typeof input?.confirmed === "boolean" && Object.keys(input).length === 1) {
      const memory = confirmMemory(auth.userId, id, input.confirmed);
      return memory ? Response.json(memory) : Response.json({ error: "记忆不存在" }, { status: 404 });
    }
    const memory = updateMemory(auth.userId, id, input);
    return memory ? Response.json(memory) : Response.json({ error: "记忆不存在" }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  return deleteMemory(auth.userId, id)
    ? Response.json({ ok: true })
    : Response.json({ error: "记忆不存在" }, { status: 404 });
}
