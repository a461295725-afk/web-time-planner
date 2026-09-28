import { requireAssistantToken } from "@/lib/assistant-auth";
import { todayKey } from "@/lib/date";
import { getSmartDaySnapshot, smartDayErrorResponse } from "@/lib/smart-day-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireAssistantToken(request, "context:read");
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });
  try {
    const date = new URL(request.url).searchParams.get("date") ?? todayKey();
    return Response.json(getSmartDaySnapshot(auth.userId, date));
  } catch (error) {
    return smartDayErrorResponse(error);
  }
}
