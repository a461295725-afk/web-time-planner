import { getUserFromRequest } from "@/lib/auth";
import {
  confirmSmartDayPlan,
  smartDayErrorResponse,
} from "@/lib/smart-day-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getUserFromRequest(_request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  try {
    const { id } = await params;
    return Response.json(confirmSmartDayPlan(auth.userId, id));
  } catch (error) {
    return smartDayErrorResponse(error);
  }
}
