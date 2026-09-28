import {
  AssistantIdentity,
  AssistantScope,
  authenticateAssistantToken,
} from "@/lib/assistant-token-store";

export function requireAssistantToken(
  request: Request,
  requiredScope: AssistantScope
): AssistantIdentity | null {
  const token = request.headers.get("X-API-Token");
  if (!token) return null;
  const identity = authenticateAssistantToken(token);
  if (!identity || !identity.scopes.includes(requiredScope)) return null;
  return identity;
}
