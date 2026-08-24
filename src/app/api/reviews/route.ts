import { getUserFromRequest } from "@/lib/auth";
import { shiftDate, todayKey, weekStartKey } from "@/lib/date";
import {
  getReview,
  getReviewStats,
  listReviews,
  saveReview,
} from "@/lib/review-store";
import { ReviewPeriodType } from "@/lib/review-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown): Response {
  return Response.json(
    { error: error instanceof Error ? error.message : "复盘请求无效" },
    { status: 400 }
  );
}

function periodRange(periodType: ReviewPeriodType, requestedStart: string): { start: string; end: string } {
  const start = periodType === "weekly" ? weekStartKey(requestedStart) : requestedStart;
  return { start, end: periodType === "weekly" ? shiftDate(start, 6) : start };
}

export async function GET(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  try {
    const url = new URL(request.url);
    const periodType = (url.searchParams.get("periodType") ?? "daily") as ReviewPeriodType;
    const requestedStart = url.searchParams.get("periodStart") ?? todayKey();
    const range = periodRange(periodType, requestedStart);
    const from = url.searchParams.get("from") ?? range.start;
    const to = url.searchParams.get("to") ?? range.end;
    return Response.json({
      review: getReview(auth.userId, periodType, requestedStart) ?? null,
      reviews: listReviews(auth.userId, periodType, from, to),
      stats: getReviewStats(auth.userId, range.start, range.end),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  try {
    const input = await request.json();
    if (input?.periodType !== "daily" && input?.periodType !== "weekly") {
      return Response.json({ error: "复盘周期无效" }, { status: 400 });
    }
    if (typeof input.periodStart !== "string") {
      return Response.json({ error: "缺少复盘日期" }, { status: 400 });
    }
    return Response.json(
      saveReview(auth.userId, {
        periodType: input.periodType,
        periodStart: input.periodStart,
        wins: input.wins,
        blockers: input.blockers,
        nextAction: input.nextAction,
        notes: input.notes,
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
