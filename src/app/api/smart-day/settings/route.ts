import { getUserFromRequest } from "@/lib/auth";
import {
  getSmartDaySettings,
  smartDayErrorResponse,
  updateSmartDaySettings,
} from "@/lib/smart-day-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  try {
    return Response.json(getSmartDaySettings(auth.userId));
  } catch (error) {
    return smartDayErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  try {
    const input = (await request.json()) as { windows?: unknown; capacityMinutes?: unknown };
    return Response.json(updateSmartDaySettings(auth.userId, input));
  } catch (error) {
    return smartDayErrorResponse(error);
  }
}
