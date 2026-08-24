import { requireHermesToken } from "@/lib/hermes-auth";
import { getIdeas, createIdea, deleteIdea } from "@/lib/server-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = requireHermesToken(request);
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });

  return Response.json(getIdeas(auth.userId));
}

export async function POST(request: Request) {
  const auth = requireHermesToken(request);
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });

  return Response.json(createIdea(auth.userId), { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = requireHermesToken(request);
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });

  const { id } = await request.json();
  if (!id) return Response.json({ error: "缺少想法 ID" }, { status: 400 });
  return deleteIdea(auth.userId, id)
    ? Response.json({ ok: true })
    : Response.json({ error: "想法不存在" }, { status: 404 });
}
