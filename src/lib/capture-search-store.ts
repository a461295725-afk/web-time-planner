import { randomUUID } from "node:crypto";
import { sqlite } from "@/db";
import { broadcastChange } from "@/lib/sse-manager";
import type {
  CaptureInput,
  CaptureKind,
  CaptureResponse,
  CapturedIdea,
  CapturedReading,
  CapturedTask,
  InboxItem,
  InboxResponse,
  SearchKind,
  SearchResponse,
  SearchResult,
  SearchStatus,
  SearchType,
  TaskDetail,
} from "@/lib/capture-search-types";
import { todayKey } from "@/lib/date";
import { isDateKey } from "@/lib/validation";

const MAX_RESULTS = 50;
const MAX_QUERY_LENGTH = 200;

export class CaptureSearchInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaptureSearchInputError";
  }
}

type SearchRow = {
  kind: SearchKind;
  id: string;
  title: string;
  snippet: string | null;
  created_at: number;
  updated_at: number;
  priority: "P1" | "P2" | "P3" | null;
  status: "todo" | "done" | "overdue" | null;
  scheduled_date: string | null;
  project_id: string | null;
  is_read: number | null;
  url: string | null;
  source: string | null;
};

export type SearchOptions = {
  query?: string;
  type?: SearchType;
  status?: SearchStatus;
  inbox?: boolean;
  limit?: number;
};

function invalid(message: string): never {
  throw new CaptureSearchInputError(message);
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedQuery(value: unknown): string {
  return cleanText(value).slice(0, MAX_QUERY_LENGTH);
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function searchClause(fields: string[], query: string): {
  sql: string;
  params: string[];
} {
  if (!query) return { sql: "1 = 1", params: [] };
  const pattern = `%${escapeLike(query)}%`;
  return {
    sql: `(${fields
      .map((field) => `${field} LIKE ? COLLATE NOCASE ESCAPE '\\'`)
      .join(" OR ")})`,
    params: fields.map(() => pattern),
  };
}

function typeList(type: SearchType): SearchKind[] {
  return type === "all" ? ["task", "project", "idea", "reading"] : [type];
}

function statusClause(kind: SearchKind, status: SearchStatus, inbox: boolean): string {
  const wantsInbox = inbox || status === "inbox";
  if (kind === "task") {
    const clauses: string[] = [];
    if (status === "done") clauses.push("status = 'done'");
    if (status === "open" || status === "inbox" || wantsInbox) {
      clauses.push("status <> 'done'");
    }
    if (["read", "unread"].includes(status)) return "1 = 0";
    if (wantsInbox) clauses.push("scheduled_date IS NULL", "project_id IS NULL");
    return clauses.length > 0 ? clauses.join(" AND ") : "1 = 1";
  }

  if (kind === "reading") {
    if (status === "done") return "1 = 0";
    const clauses: string[] = [];
    if (status === "unread" || status === "open" || wantsInbox) clauses.push("is_read = 0");
    if (status === "read") clauses.push("is_read = 1");
    return clauses.length > 0 ? clauses.join(" AND ") : "1 = 1";
  }

  if (kind === "project" && wantsInbox) return "1 = 0";
  if (status === "done" || status === "read" || status === "unread") return "1 = 0";
  return "1 = 1";
}

function branch(kind: SearchKind, userId: string, query: string, status: SearchStatus, inbox: boolean): {
  sql: string;
  params: unknown[];
} {
  const table =
    kind === "task"
      ? "tasks"
      : kind === "project"
        ? "projects"
        : kind === "idea"
          ? "ideas"
          : "reading_items";
  const fields =
    kind === "task"
      ? ["title", "COALESCE(description, '')"]
      : kind === "project"
        ? ["name", "COALESCE(description, '')"]
        : kind === "idea"
          ? ["title", "content"]
          : ["title", "url", "normalized_url", "notes"];
  const text = searchClause(fields, query);
  const statusSql = statusClause(kind, status, inbox);
  const select =
    kind === "task"
      ? `SELECT 'task' AS kind, id, title,
           substr(trim(COALESCE(description, '')), 1, 240) AS snippet,
           created_at, updated_at, priority, status, scheduled_date, project_id,
           NULL AS is_read, NULL AS url, NULL AS source
         FROM tasks`
      : kind === "project"
        ? `SELECT 'project' AS kind, id, name AS title,
             substr(trim(COALESCE(description, '')), 1, 240) AS snippet,
             created_at, updated_at, NULL AS priority, NULL AS status,
             NULL AS scheduled_date, NULL AS project_id,
             NULL AS is_read, NULL AS url, NULL AS source
           FROM projects`
        : kind === "idea"
          ? `SELECT 'idea' AS kind, id, title,
               substr(trim(COALESCE(content, '')), 1, 240) AS snippet,
               created_at, updated_at, NULL AS priority, NULL AS status,
               NULL AS scheduled_date, NULL AS project_id,
               NULL AS is_read, NULL AS url, NULL AS source
             FROM ideas`
          : `SELECT 'reading' AS kind, id, title,
               substr(trim(COALESCE(notes, '')), 1, 240) AS snippet,
               created_at, updated_at, NULL AS priority, NULL AS status,
               NULL AS scheduled_date, NULL AS project_id,
               is_read, url, source
             FROM reading_items`;

  return {
    sql: `${select} WHERE user_id = ? AND ${text.sql} AND ${statusSql}`,
    params: [userId, ...text.params],
  };
}

function resultHref(kind: SearchKind, id: string): string {
  const encodedId = encodeURIComponent(id);
  if (kind === "task") return `/tasks/${encodedId}`;
  if (kind === "project") return `/projects/${encodedId}`;
  if (kind === "idea") return `/ideas?idea=${encodedId}`;
  return `/reading?item=${encodedId}`;
}

function mapResult(row: SearchRow): SearchResult {
  const snippet = row.snippet?.trim() || row.url || "";
  const meta: SearchResult["meta"] = {};
  if (row.kind === "task") {
    meta.priority = row.priority ?? undefined;
    meta.done = row.status === "done";
    meta.scheduledDate = row.scheduled_date;
    meta.projectId = row.project_id;
  }
  if (row.kind === "reading") {
    meta.isRead = Boolean(row.is_read);
    meta.url = row.url ?? undefined;
    meta.source = row.source ?? undefined;
  }
  return {
    type: row.kind,
    kind: row.kind,
    id: row.id,
    title: row.title || row.url || "未命名",
    snippet: snippet.slice(0, 240),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    href: resultHref(row.kind, row.id),
    meta,
  };
}

function boundedLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return MAX_RESULTS;
  return Math.max(1, Math.min(MAX_RESULTS, Math.floor(value)));
}

export function searchContent(
  userId: string,
  options: SearchOptions = {}
): SearchResponse {
  const query = normalizedQuery(options.query);
  const type = options.type ?? "all";
  const status = options.status ?? "all";
  const inbox = Boolean(options.inbox);
  const limit = boundedLimit(options.limit);
  const branches = typeList(type).map((kind) => branch(kind, userId, query, status, inbox));
  const unionSql = branches.map((item) => item.sql).join(" UNION ALL ");
  const params = branches.flatMap((item) => item.params);
  const totalRow = sqlite
    .prepare(`SELECT COUNT(*) AS total FROM (${unionSql}) AS search_results`)
    .get(...params) as { total: number };
  const rows = sqlite
    .prepare(
      `SELECT kind, id, title, snippet, created_at, updated_at, priority, status,
        scheduled_date, project_id, is_read, url, source
       FROM (${unionSql}) AS search_results
       ORDER BY updated_at DESC, created_at DESC, id ASC
       LIMIT ?`
    )
    .all(...params, limit) as SearchRow[];
  return {
    query,
    type,
    status,
    inbox,
    total: totalRow.total,
    items: rows.map(mapResult),
  };
}

export function getInbox(
  userId: string,
  type: "all" | CaptureKind = "all",
  limit = MAX_RESULTS
): InboxResponse {
  const allResult = searchContent(userId, {
    type: "all",
    status: "inbox",
    inbox: true,
    limit,
  });
  const selected =
    type === "all"
      ? allResult
      : searchContent(userId, {
          type,
          status: "inbox",
          inbox: true,
          limit,
        });
  const counts = {
    all: allResult.total,
    task: searchContent(userId, { type: "task", status: "inbox", inbox: true, limit: 1 }).total,
    idea: searchContent(userId, { type: "idea", status: "inbox", inbox: true, limit: 1 }).total,
    reading: searchContent(userId, { type: "reading", status: "inbox", inbox: true, limit: 1 }).total,
  } as InboxResponse["counts"];
  const items: InboxItem[] = selected.items.map((item) => ({
    type: item.type as CaptureKind,
    kind: item.kind as CaptureKind,
    id: item.id,
    title: item.title,
    preview: item.snippet,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    href: item.href,
    meta: item.meta,
  }));
  return {
    type,
    total: selected.total,
    counts,
    items,
  };
}

function normalizeReadingUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    invalid("链接格式无效");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") invalid("链接格式无效");
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (lower.startsWith("utm_") || lower === "spm") url.searchParams.delete(key);
  }
  return url.toString().replace(/\/$/, "");
}

function captureTask(userId: string, input: CaptureInput): CapturedTask {
  const title = cleanText(input.title) || cleanText(input.content).split("\n")[0].trim();
  if (!title) invalid("任务标题不能为空");
  const priority = input.priority ?? "P2";
  if (!["P1", "P2", "P3"].includes(priority)) invalid("优先级无效");
  const timestamp = Date.now();
  const id = randomUUID();
  const max = sqlite
    .prepare(
      `SELECT COALESCE(MAX(sort_order), -1) AS max_order
       FROM tasks WHERE user_id = ? AND project_id IS NULL
       AND scheduled_date IS NULL AND show_in_week_plan = 0`
    )
    .get(userId) as { max_order: number };
  sqlite
    .prepare(
      `INSERT INTO tasks
       (id, user_id, title, description, priority, status, due_date, scheduled_date,
        project_id, show_in_week_plan, sort_order, today_sort_order, estimated_minutes,
        energy_level, preferred_period, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'todo', NULL, NULL, NULL, 0, ?, 0, NULL, NULL, NULL, NULL, ?, ?)`
    )
    .run(id, userId, title, cleanText(input.content), priority, max.max_order + 1, timestamp, timestamp);
  return {
    id,
    title,
    description: cleanText(input.content),
    priority,
    done: false,
    scheduledDate: null,
    projectId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function captureIdea(userId: string, input: CaptureInput): CapturedIdea {
  const content = cleanText(input.content);
  const title = cleanText(input.title) || content.split("\n")[0].trim().slice(0, 120);
  if (!title) invalid("想法标题不能为空");
  const timestamp = Date.now();
  const id = randomUUID();
  sqlite
    .prepare(
      `INSERT INTO ideas (id, user_id, title, content, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, userId, title, content, timestamp, timestamp);
  return { id, title, content, createdAt: timestamp, updatedAt: timestamp };
}

function captureReading(userId: string, input: CaptureInput): { item: CapturedReading; existed: boolean } {
  const rawUrl = cleanText(input.url);
  if (!rawUrl) invalid("阅读链接不能为空");
  const normalizedUrl = normalizeReadingUrl(rawUrl);
  const existing = sqlite
    .prepare(
      `SELECT id FROM reading_items WHERE user_id = ? AND normalized_url = ?`
    )
    .get(userId, normalizedUrl) as { id: string } | undefined;
  const timestamp = Date.now();
  const title = cleanText(input.title) || normalizedUrl;
  const notes = cleanText(input.notes) || contentFallback(input.content);
  if (existing) {
    sqlite
      .prepare(
        `UPDATE reading_items SET title = ?, notes = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`
      )
      .run(title, notes, timestamp, existing.id, userId);
    const item = sqlite
      .prepare(
        `SELECT id, url, normalized_url AS normalizedUrl, title, notes,
          is_read AS isRead, source, created_at AS createdAt, updated_at AS updatedAt
         FROM reading_items WHERE id = ? AND user_id = ?`
      )
      .get(existing.id, userId) as Omit<CapturedReading, "isRead"> & { isRead: number };
    return { item: { ...item, isRead: Boolean(item.isRead) }, existed: true };
  }
  const id = randomUUID();
  sqlite
    .prepare(
      `INSERT INTO reading_items
       (id, user_id, url, normalized_url, title, notes, is_read, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'manual', ?, ?)`
    )
    .run(id, userId, rawUrl, normalizedUrl, title, notes, timestamp, timestamp);
  return {
    item: {
      id,
      url: rawUrl,
      normalizedUrl,
      title,
      notes,
      isRead: false,
      source: "manual",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    existed: false,
  };
}

function contentFallback(value: unknown): string {
  return cleanText(value);
}

export function captureItem(userId: string, input: CaptureInput): CaptureResponse {
  const kind = input.kind ?? input.type;
  if (!kind || !["task", "idea", "reading"].includes(kind)) invalid("收集类型无效");
  const result = sqlite.transaction(() => {
    if (kind === "task") {
      return {
        kind,
        type: kind,
        existed: false,
        item: captureTask(userId, input),
      } satisfies CaptureResponse;
    }
    if (kind === "idea") {
      return {
        kind,
        type: kind,
        existed: false,
        item: captureIdea(userId, input),
      } satisfies CaptureResponse;
    }
    const reading = captureReading(userId, input);
    return {
      kind,
      type: kind,
      existed: reading.existed,
      item: reading.item,
    } satisfies CaptureResponse;
  })();
  broadcastChange(userId);
  return result;
}

function taskDetailRow(userId: string, id: string): TaskDetail | undefined {
  const row = sqlite
    .prepare(
      `SELECT id, title, COALESCE(description, '') AS description, priority,
        status, scheduled_date, show_in_week_plan, project_id, due_date,
        completed_at, created_at, updated_at
       FROM tasks WHERE id = ? AND user_id = ?`
    )
    .get(id, userId) as
    | {
        id: string;
        title: string;
        description: string;
        priority: "P1" | "P2" | "P3";
        status: "todo" | "done" | "overdue";
        scheduled_date: string | null;
        show_in_week_plan: number;
        project_id: string | null;
        due_date: string | null;
        completed_at: number | null;
        created_at: number;
        updated_at: number;
      }
    | undefined;
  if (!row) return undefined;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    done: row.status === "done",
    scheduledDate: row.scheduled_date,
    showInWeekPlan: Boolean(row.show_in_week_plan),
    projectId: row.project_id,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getTaskDetail(userId: string, id: string): TaskDetail | undefined {
  return taskDetailRow(userId, id);
}

export function updateTaskDetail(
  userId: string,
  id: string,
  input: {
    action?: "today" | "week" | "complete" | "reopen";
    date?: string;
    title?: string;
    description?: string;
  }
): TaskDetail | undefined {
  const current = taskDetailRow(userId, id);
  if (!current) return undefined;
  const action = input.action;
  if (action && !["today", "week", "complete", "reopen"].includes(action)) {
    invalid("任务操作无效");
  }
  const date = input.date ?? "";
  if (action === "today" && !isDateKey(date)) invalid("安排日期无效");
  const title = input.title?.trim() || current.title;
  const description = input.description ?? current.description;
  const timestamp = Date.now();
  const result = sqlite.transaction(() => {
    let scheduledDate = current.scheduledDate;
    let showInWeekPlan = current.showInWeekPlan;
    let status: "todo" | "done" | "overdue" = current.status;
    let completedAt = current.completedAt;
    if (action === "today") {
      scheduledDate = date;
      showInWeekPlan = false;
    }
    if (action === "week") {
      scheduledDate = null;
      showInWeekPlan = true;
    }
    if (action === "complete") {
      status = "done";
      completedAt = timestamp;
    }
    if (action === "reopen") {
      status = "todo";
      completedAt = null;
    }
    sqlite
      .prepare(
        `UPDATE tasks SET title = ?, description = ?, status = ?, due_date = ?,
          scheduled_date = ?, show_in_week_plan = ?, completed_at = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`
      )
      .run(
        title,
        description,
        status,
        current.dueDate,
        scheduledDate,
        showInWeekPlan ? 1 : 0,
        completedAt,
        timestamp,
        id,
        userId
      );
    if (scheduledDate !== current.scheduledDate) {
      sqlite
        .prepare(
          `INSERT INTO planning_feedback_events
           (id, user_id, plan_id, task_id, date, event_type, payload_json, created_at)
           VALUES (?, ?, NULL, ?, ?, 'rescheduled', ?, ?)`
        )
        .run(
          randomUUID(),
          userId,
          id,
          todayKey(),
          JSON.stringify({ from: current.scheduledDate, to: scheduledDate }),
          timestamp
        );
    }
    if (current.done !== (status === "done")) {
      sqlite
        .prepare(
          `INSERT INTO planning_feedback_events
           (id, user_id, plan_id, task_id, date, event_type, payload_json, created_at)
           VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`
        )
        .run(
          randomUUID(),
          userId,
          id,
          todayKey(),
          status === "done" ? "completed" : "reopened",
          JSON.stringify({ scheduledDate }),
          timestamp
        );
    }
    return taskDetailRow(userId, id)!;
  })();
  broadcastChange(userId);
  return result;
}
