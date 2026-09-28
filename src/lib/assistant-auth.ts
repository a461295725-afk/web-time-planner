import {
  AssistantIdentity,
  AssistantScope,
  authenticateAssistantToken,
} from "@/lib/assistant-token-store";

export function getAssistantIdentity(request: Request): AssistantIdentity | null {
  const token = request.headers.get("X-API-Token");
  return token ? authenticateAssistantToken(token) : null;
}

export function forbidAssistantDelete(request: Request): Response | null {
  return getAssistantIdentity(request)
    ? Response.json(
        { error: "助手不能删除，请用 outcome=dropped" },
        { status: 403 }
      )
    : null;
}

export function requireAssistantToken(
  request: Request,
  requiredScope: AssistantScope
): AssistantIdentity | null {
  const identity = getAssistantIdentity(request);
  if (!identity || !identity.scopes.includes(requiredScope)) return null;
  return identity;
}
