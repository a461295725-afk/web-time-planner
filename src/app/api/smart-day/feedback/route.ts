import { getUserFromRequest } from "@/lib/auth";
import {
  listFeedbackEvents,
  smartDayErrorResponse,
} from "@/lib/smart-day-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  try {
    const params = new URL(request.url).searchParams;
    const sinceValue = params.get("since");
    const limitValue = params.get("limit");
    return Response.json(
      listFeedbackEvents(auth.userId, {
        date: params.get("date") ?? undefined,
        since: sinceValue === null ? undefined : Number(sinceValue),
        limit: limitValue === null ? undefined : Number(limitValue),
      })
    );
  } catch (error) {
    return smartDayErrorResponse(error);
  }
}
