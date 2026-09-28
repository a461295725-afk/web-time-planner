import { requireHermesToken } from "@/lib/hermes-auth";
import { requireAssistantToken } from "@/lib/assistant-auth";
import { todayKey } from "@/lib/date";
import {
  getHermesSmartDaySummary,
  smartDayErrorResponse,
  type HermesSmartDayKind,
} from "@/lib/smart-day-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth =
    requireAssistantToken(request, "context:read") ?? requireHermesToken(request);
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });
  try {
    const params = new URL(request.url).searchParams;
    const date = params.get("date") ?? todayKey();
    const kind = (params.get("kind") ?? "morning") as HermesSmartDayKind;
    return Response.json(getHermesSmartDaySummary(auth.userId, date, kind));
  } catch (error) {
    return smartDayErrorResponse(error);
  }
}
