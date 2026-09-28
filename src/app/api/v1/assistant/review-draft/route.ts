import { requireAssistantToken } from "@/lib/assistant-auth";
import { buildAssistantReviewDraft } from "@/lib/assistant-review-store";
import { todayKey } from "@/lib/date";
import type { ReviewPeriodType } from "@/lib/review-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireAssistantToken(request, "context:read");
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });
  try {
    const params = new URL(request.url).searchParams;
    const periodType = (params.get("periodType") ?? "daily") as ReviewPeriodType;
    const periodStart = params.get("periodStart") ?? todayKey();
    return Response.json(buildAssistantReviewDraft(auth.userId, periodType, periodStart));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "复盘草稿生成失败" },
      { status: 400 }
    );
  }
}
