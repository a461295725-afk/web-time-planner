import { getUserFromRequest } from "@/lib/auth";
import {
  smartDayErrorResponse,
  updateSmartDayItem,
} from "@/lib/smart-day-store";
import type { SmartDayItemActionInput } from "@/lib/smart-day-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  try {
    const { id } = await params;
    const input = (await request.json()) as SmartDayItemActionInput;
    return Response.json(updateSmartDayItem(auth.userId, id, input));
  } catch (error) {
    return smartDayErrorResponse(error);
  }
}
