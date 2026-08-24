import { getUserFromRequest } from "@/lib/auth";
import {
  CaptureSearchInputError,
  getInbox,
} from "@/lib/capture-search-store";
import type { CaptureKind } from "@/lib/capture-search-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INBOX_TYPES = new Set(["all", "task", "idea", "reading"]);

function parseType(value: string | null): "all" | CaptureKind {
  const type = value ?? "all";
  if (!INBOX_TYPES.has(type)) throw new CaptureSearchInputError("收件箱类型无效");
  return type as "all" | CaptureKind;
}

function parseLimit(value: string | null): number {
  if (!value) return 50;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new CaptureSearchInputError("收件箱数量无效");
  }
  return Math.min(limit, 50);
}

export async function GET(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  try {
    const params = new URL(request.url).searchParams;
    return Response.json(
      getInbox(auth.userId, parseType(params.get("type")), parseLimit(params.get("limit")))
    );
  } catch (error) {
    if (error instanceof CaptureSearchInputError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ error: "收件箱加载失败" }, { status: 500 });
  }
}
