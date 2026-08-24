import {
  getSettings,
  revokeHermesToken,
  resetHermesToken,
  updateSettings,
} from "@/lib/server-store";
import { getUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  return Response.json(getSettings(auth.userId));
}

export async function PATCH(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const input = (await request.json()) as Record<string, unknown>;
  if (input.hermesTokenAction === "reset") {
    const issued = resetHermesToken(auth.userId);
    return Response.json({
      ...getSettings(auth.userId),
      hermesApiToken: issued.token,
    });
  }
  if (input.hermesTokenAction === "revoke") {
    revokeHermesToken(auth.userId);
    return Response.json(getSettings(auth.userId));
  }
  delete input.hermesTokenAction;
  return Response.json(updateSettings(auth.userId, input as Parameters<typeof updateSettings>[1]));
}
