import { getUserFromRequest } from "@/lib/auth";
import {
  CaptureSearchInputError,
  searchContent,
} from "@/lib/capture-search-store";
import type {
  SearchStatus,
  SearchType,
} from "@/lib/capture-search-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEARCH_TYPES = new Set<SearchType>([
  "all",
  "task",
  "project",
  "idea",
  "reading",
]);
const SEARCH_STATUSES = new Set<SearchStatus>([
  "all",
  "open",
  "done",
  "unread",
  "read",
  "inbox",
]);

function queryValue(value: string | null): string | undefined {
  return value === null ? undefined : value;
}

function parseType(value: string | undefined): SearchType {
  const type = value ?? "all";
  if (!SEARCH_TYPES.has(type as SearchType)) throw new CaptureSearchInputError("搜索类型无效");
  return type as SearchType;
}

function parseStatus(value: string | undefined): SearchStatus {
  const status = value ?? "all";
  if (!SEARCH_STATUSES.has(status as SearchStatus)) throw new CaptureSearchInputError("搜索筛选无效");
  return status as SearchStatus;
}

function parseLimit(value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new CaptureSearchInputError("搜索数量无效");
  }
  return Math.min(limit, 50);
}

function parseBoolean(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

export async function GET(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  try {
    const params = new URL(request.url).searchParams;
    return Response.json(
      searchContent(auth.userId, {
        query: queryValue(params.get("q") ?? params.get("query")),
        type: parseType(params.get("type") ?? undefined),
        status: parseStatus(params.get("status") ?? undefined),
        inbox: parseBoolean(params.get("inbox") ?? undefined),
        limit: parseLimit(params.get("limit") ?? undefined),
      })
    );
  } catch (error) {
    if (error instanceof CaptureSearchInputError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ error: "搜索失败" }, { status: 500 });
  }
}
