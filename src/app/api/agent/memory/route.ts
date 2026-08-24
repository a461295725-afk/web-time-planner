import { getUserFromRequest } from "@/lib/auth";
import { getMemories, upsertMemory } from "@/lib/memory-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown): Response {
  return Response.json(
    { error: error instanceof Error ? error.message : "记忆请求无效" },
    { status: 400 }
  );
}

export async function GET(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const includeExpired = new URL(request.url).searchParams.get("includeExpired") === "1";
  return Response.json({ memories: getMemories(auth.userId, includeExpired) });
}

export async function POST(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  try {
    const input = await request.json();
    if (!input || typeof input.category !== "string" || typeof input.key !== "string") {
      return Response.json({ error: "记忆分类和键不能为空" }, { status: 400 });
    }
    if (input.source !== undefined && input.source !== "user") {
      return Response.json({ error: "用户创建的记忆来源必须是 user" }, { status: 400 });
    }
    return Response.json(
      upsertMemory(auth.userId, {
        category: input.category,
        key: input.key,
        value: input.value,
        source: "user",
        evidenceCount: input.evidenceCount,
        confidence: input.confidence,
        confirmed: input.confirmed,
        expiresAt: input.expiresAt,
      }),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
