import { requireAssistantToken } from "@/lib/assistant-auth";
import {
  AssistantIdempotencyError,
  idempotentResponse,
  runAssistantMutation,
} from "@/lib/assistant-idempotency";
import { todayKey } from "@/lib/date";
import { parseJsonBody, requestJsonErrorResponse } from "@/lib/request-json";
import { getReview, listReviews, saveReview } from "@/lib/review-store";
import type { ReviewPeriodType } from "@/lib/review-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value.length > 0 ? value.map((item) => `- ${item}`).join("\n") : "";
  }
  throw new Error("复盘内容无效");
}

export async function GET(request: Request) {
  const auth = requireAssistantToken(request, "context:read");
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });
  try {
    const params = new URL(request.url).searchParams;
    const periodType = (params.get("periodType") ?? "daily") as ReviewPeriodType;
    const periodStart = params.get("periodStart") ?? todayKey();
    return Response.json({
      review: getReview(auth.userId, periodType, periodStart) ?? null,
      reviews: listReviews(auth.userId, periodType),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "复盘读取失败" },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  const auth = requireAssistantToken(request, "reviews:write");
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });
  try {
    const input = await parseJsonBody<Record<string, unknown>>(request, {
      requireJsonContentType: true,
    });
    if (input.periodType !== "daily" && input.periodType !== "weekly") {
      return Response.json({ error: "复盘周期无效" }, { status: 400 });
    }
    if (typeof input.periodStart !== "string") {
      return Response.json({ error: "缺少复盘日期" }, { status: 400 });
    }
    return idempotentResponse(
      runAssistantMutation(request, auth, input, () => ({
        status: 201,
        body: saveReview(auth.userId, {
          periodType: input.periodType as ReviewPeriodType,
          periodStart: input.periodStart as string,
          wins: text(input.wins),
          blockers: text(input.blockers),
          nextAction: text(input.nextAction),
          notes: text(input.notes),
        }),
      }))
    );
  } catch (error) {
    const jsonError = requestJsonErrorResponse(error);
    if (jsonError) return jsonError;
    if (error instanceof AssistantIdempotencyError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "复盘保存失败" },
      { status: 400 }
    );
  }
}
