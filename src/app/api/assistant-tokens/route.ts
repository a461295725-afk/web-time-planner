import { getUserFromRequest } from "@/lib/auth";
import {
  issueAssistantToken,
  listAssistantTokens,
  revokeAssistantToken,
} from "@/lib/assistant-token-store";
import { listAssistantAuditEvents } from "@/lib/assistant-audit-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  return Response.json({
    tokens: listAssistantTokens(auth.userId),
    audit: listAssistantAuditEvents(auth.userId),
  });
}

export async function POST(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  try {
    const input = (await request.json()) as { name?: unknown; scopes?: unknown };
    if (typeof input.name !== "string") {
      return Response.json({ error: "助手名称无效" }, { status: 400 });
    }
    return Response.json(
      issueAssistantToken(auth.userId, { name: input.name, scopes: input.scopes }),
      { status: 201 }
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "助手 Token 创建失败" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const input = (await request.json()) as { id?: unknown };
  if (typeof input.id !== "string") {
    return Response.json({ error: "缺少助手 Token ID" }, { status: 400 });
  }
  return revokeAssistantToken(auth.userId, input.id)
    ? Response.json({ ok: true })
    : Response.json({ error: "助手 Token 不存在" }, { status: 404 });
}
