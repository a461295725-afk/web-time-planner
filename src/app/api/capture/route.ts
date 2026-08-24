import { getUserFromRequest } from "@/lib/auth";
import {
  captureItem,
  CaptureSearchInputError,
} from "@/lib/capture-search-store";
import type { CaptureInput } from "@/lib/capture-search-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  try {
    const input = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new CaptureSearchInputError("收集参数无效");
    }
    const result = captureItem(auth.userId, input as CaptureInput);
    return Response.json(result, { status: result.existed ? 200 : 201 });
  } catch (error) {
    if (error instanceof CaptureSearchInputError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "收集参数无效" }, { status: 400 });
    }
    return Response.json({ error: "收集失败" }, { status: 500 });
  }
}
