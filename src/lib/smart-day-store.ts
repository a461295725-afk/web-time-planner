import { randomUUID } from "node:crypto";
import { sqlite } from "@/db";
import { broadcastChange } from "@/lib/sse-manager";
import { todayKey } from "@/lib/date";
import { observeMemories } from "@/lib/memory-store";
import { isDateKey } from "@/lib/validation";
import { generateAiDraft, validateDraftItems } from "@/lib/smart-day-ai";
import {
  DEFAULT_SMART_DAY_CAPACITY_MINUTES,
  DEFAULT_SMART_DAY_WINDOWS,
  effectiveTaskMinutes,
  FocusSession,
  SmartDayBlock,
  SmartDayDraftItemInput,
  SmartDayDraftResult,
  SmartDayFeedbackEvent,
  SmartDayItemActionInput,
  SmartDayPlan,
  SmartDayPlanItem,
  SmartDaySettings,
  SmartDaySnapshot,
  SmartDayTask,
  SmartDayWindow,
} from "@/lib/smart-day-types";

type TaskRow = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  priority: "P1" | "P2" | "P3";
  status: "todo" | "done" | "overdue";
  due_date: string | null;
  scheduled_date: string | null;
  project_id: string | null;
  show_in_week_plan: number;
  estimated_minutes: number | null;
  energy_level: "low" | "medium" | "high" | null;
  preferred_period: "morning" | "afternoon" | "evening" | "anytime" | null;
  completed_at: number | null;
};

type PlanRow = {
  id: string;
  user_id: string;
  date: string;
  status: "draft" | "confirmed" | "rejected";
  source: "rules" | "ai" | "manual";
  version: number;
  summary: string;
  created_at: number;
  updated_at: number;
  confirmed_at: number | null;
};

type PlanItemRow = {
  id: string;
  user_id: string;
  plan_id: string;
  task_id: string;
  status: "proposed" | "accepted" | "rejected";
  block: SmartDayBlock;
  start_minute: number;
  end_minute: number;
  position: number;
  reason: string;
  created_at: number;
  updated_at: number;
  task_title: string;
  task_description: string | null;
  task_priority: "P1" | "P2" | "P3";
  task_status: "todo" | "done" | "overdue";
  task_due_date: string | null;
  task_scheduled_date: string | null;
  task_project_id: string | null;
  task_show_in_week_plan: number;
  task_estimated_minutes: number | null;
  task_energy_level: "low" | "medium" | "high" | null;
  task_preferred_period: "morning" | "afternoon" | "evening" | "anytime" | null;
  task_completed_at: number | null;
};

type FocusRow = {
  id: string;
  user_id: string;
  task_id: string | null;
  plan_item_id: string | null;
  date: string;
  started_at: number;
  ended_at: number | null;
  duration_seconds: number | null;
  status: "running" | "completed" | "cancelled";
  created_at: number;
  updated_at: number;
  task_title: string | null;
};

type MemoryRow = {
  key: string;
  value_json: string;
};

export class SmartDayError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400
  ) {
    super(message);
    this.name = "SmartDayError";
  }
}

export function smartDayErrorResponse(error: unknown): Response {
  if (error instanceof SmartDayError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("smart-day error", error instanceof Error ? error.message : error);
  return Response.json({ error: "智能安排服务暂时不可用" }, { status: 500 });
}

const now = () => Date.now();

function requireDate(value: unknown, field = "date"): string {
  if (!isDateKey(value)) throw new SmartDayError(`${field} 日期无效`);
  return value;
}

function assertInteger(value: unknown, field: string, min: number, max: number): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new SmartDayError(`${field} 无效`);
  }
  return value as number;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function memoryNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["minutes", "value", "defaultMinutes", "capacityMinutes", "multiplier"]) {
      const number = memoryNumber(record[key]);
      if (number !== undefined) return number;
    }
  }
  return undefined;
}

function memoryBlock(value: unknown): SmartDayBlock | undefined {
  const candidate =
    typeof value === "string"
      ? value
      : value && typeof value === "object"
        ? (value as Record<string, unknown>).period ?? (value as Record<string, unknown>).block
        : undefined;
  return candidate === "morning" || candidate === "afternoon" || candidate === "evening"
    ? candidate
    : undefined;
}

function normalizeWindows(value: unknown): SmartDayWindow[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const byBlock = new Map<SmartDayBlock, SmartDayWindow>();
  for (const item of value) {
    if (!item || typeof item !== "object") return undefined;
    const record = item as Record<string, unknown>;
    const block = record.block;
    if (block !== "morning" && block !== "afternoon" && block !== "evening") return undefined;
    const startMinute = record.startMinute;
    const endMinute = record.endMinute;
    if (
      !Number.isInteger(startMinute) ||
      !Number.isInteger(endMinute) ||
      (startMinute as number) < 0 ||
      (endMinute as number) > 1440 ||
      (endMinute as number) <= (startMinute as number)
    ) {
      return undefined;
    }
    byBlock.set(block, { block, startMinute: startMinute as number, endMinute: endMinute as number });
  }
  if (byBlock.size !== 3) return undefined;
  const windows = (["morning", "afternoon", "evening"] as SmartDayBlock[]).map(
    (block) => byBlock.get(block)!
  );
  for (let index = 1; index < windows.length; index += 1) {
    if (windows[index - 1].endMinute > windows[index].startMinute) return undefined;
  }
  return windows;
}

function getConfirmedMemoryOverrides(userId: string): SmartDaySettings["memoryOverrides"] {
  const rows = sqlite
    .prepare(
      `SELECT key, value_json
       FROM agent_memories
       WHERE user_id = ?
         AND category IN ('explicit', 'preference', 'behavior')
         AND confirmed = 1
         AND (expires_at IS NULL OR expires_at > ?)
         AND key IN ('daily_capacity_minutes', 'preferred_focus_period', 'default_estimated_minutes', 'estimate_multiplier')`
    )
    .all(userId, now()) as MemoryRow[];
  const result: SmartDaySettings["memoryOverrides"] = {};
  for (const row of rows) {
    const parsed = parseJson(row.value_json);
    if (row.key === "daily_capacity_minutes") {
      const value = memoryNumber(parsed);
      if (value !== undefined && Number.isInteger(value) && value >= 30 && value <= 1440) {
        result.dailyCapacityMinutes = value;
      }
    } else if (row.key === "default_estimated_minutes") {
      const value = memoryNumber(parsed);
      if (value !== undefined && Number.isInteger(value) && value >= 5 && value <= 1440) {
        result.defaultEstimatedMinutes = value;
      }
    } else if (row.key === "preferred_focus_period") {
      const value = memoryBlock(parsed);
      if (value) result.preferredFocusPeriod = value;
    } else if (row.key === "estimate_multiplier") {
      const value = memoryNumber(parsed);
      if (value !== undefined && value >= 0.25 && value <= 4) {
        result.estimateMultiplier = value;
      }
    }
  }
  return result;
}

export function getSmartDaySettings(userId: string): SmartDaySettings {
  const rows = sqlite
    .prepare("SELECT key, value FROM app_settings WHERE user_id = ? AND key IN ('smartDayWindows', 'smartDayCapacityMinutes')")
    .all(userId) as { key: string; value: string }[];
  const values = new Map(rows.map((row) => [row.key, row.value]));
  const windows = normalizeWindows(parseJson(values.get("smartDayWindows") ?? "")) ?? DEFAULT_SMART_DAY_WINDOWS;
  const storedCapacity = Number(values.get("smartDayCapacityMinutes"));
  const memoryOverrides = getConfirmedMemoryOverrides(userId);
  const capacityMinutes =
    memoryOverrides.dailyCapacityMinutes ??
    (Number.isInteger(storedCapacity) && storedCapacity >= 30 && storedCapacity <= 1440
      ? storedCapacity
      : DEFAULT_SMART_DAY_CAPACITY_MINUTES);
  return {
    timezone: "Asia/Shanghai",
    windows,
    capacityMinutes,
    memoryOverrides,
  };
}

export function updateSmartDaySettings(
  userId: string,
  input: { windows?: unknown; capacityMinutes?: unknown }
): SmartDaySettings {
  const current = getSmartDaySettings(userId);
  const windows = input.windows === undefined ? current.windows : normalizeWindows(input.windows);
  if (!windows) throw new SmartDayError("工作时段必须包含有效的上午、下午和晚上窗口");
  const capacityMinutes =
    input.capacityMinutes === undefined
      ? current.capacityMinutes
      : assertInteger(input.capacityMinutes, "每日容量", 30, 1440);
  const timestamp = now();
  const statement = sqlite.prepare(
    `INSERT INTO app_settings (id, user_id, key, value, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  );
  sqlite.transaction(() => {
    statement.run(randomUUID(), userId, "smartDayWindows", JSON.stringify(windows), timestamp);
    statement.run(randomUUID(), userId, "smartDayCapacityMinutes", String(capacityMinutes), timestamp);
  })();
  broadcastChange(userId);
  return getSmartDaySettings(userId);
}

function mapTask(row: TaskRow): SmartDayTask {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    priority: row.priority,
    done: row.status === "done",
    dueDate: row.due_date ?? "",
    scheduledDate: row.scheduled_date ?? undefined,
    projectId: row.project_id ?? undefined,
    showInWeekPlan: Boolean(row.show_in_week_plan),
    estimatedMinutes: row.estimated_minutes ?? undefined,
    energyLevel: row.energy_level ?? undefined,
    preferredPeriod: row.preferred_period ?? undefined,
    completedAt: row.completed_at ?? undefined,
  };
}

function taskSelect(): string {
  return `
    SELECT id, user_id, title, description, priority, status, due_date, scheduled_date,
      project_id, show_in_week_plan, estimated_minutes, energy_level,
      preferred_period, completed_at
    FROM tasks`;
}

function getCandidateTasks(userId: string, date: string): SmartDayTask[] {
  const rows = sqlite
    .prepare(
      `${taskSelect()}
       WHERE user_id = ? AND status <> 'done'
         AND (
           scheduled_date = ?
           OR (due_date IS NOT NULL AND due_date <= ?)
           OR (show_in_week_plan = 1 AND scheduled_date IS NULL)
         )
       ORDER BY
         CASE WHEN due_date IS NOT NULL AND due_date < ? THEN 0
              WHEN due_date = ? THEN 1 ELSE 2 END,
         CASE priority WHEN 'P1' THEN 0 WHEN 'P2' THEN 1 ELSE 2 END,
         created_at ASC`
    )
    .all(userId, date, date, date, date) as TaskRow[];
  return rows.map(mapTask);
}

function getOwnedTasks(userId: string, ids: string[]): SmartDayTask[] {
  if (ids.length === 0) return [];
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length !== ids.length) throw new SmartDayError("任务列表包含重复 ID");
  const placeholders = uniqueIds.map(() => "?").join(",");
  const rows = sqlite
    .prepare(`${taskSelect()} WHERE user_id = ? AND id IN (${placeholders})`)
    .all(userId, ...uniqueIds) as TaskRow[];
  if (rows.length !== uniqueIds.length) throw new SmartDayError("存在不属于当前用户的任务", 403);
  const byId = new Map(rows.map((row) => [row.id, mapTask(row)]));
  return uniqueIds.map((id) => byId.get(id)!);
}

function planRow(userId: string, planId: string): PlanRow | undefined {
  return sqlite
    .prepare("SELECT id, user_id, date, status, source, version, summary, created_at, updated_at, confirmed_at FROM day_plans WHERE id = ? AND user_id = ?")
    .get(planId, userId) as PlanRow | undefined;
}

function planItemRows(userId: string, planId: string): PlanItemRow[] {
  return sqlite
    .prepare(
      `SELECT i.id, i.user_id, i.plan_id, i.task_id, i.status, i.block,
        i.start_minute, i.end_minute, i.position, i.reason, i.created_at, i.updated_at,
        t.title AS task_title, t.description AS task_description, t.priority AS task_priority,
        t.status AS task_status, t.due_date AS task_due_date, t.scheduled_date AS task_scheduled_date,
        t.project_id AS task_project_id, t.show_in_week_plan AS task_show_in_week_plan,
        t.estimated_minutes AS task_estimated_minutes, t.energy_level AS task_energy_level,
        t.preferred_period AS task_preferred_period, t.completed_at AS task_completed_at
       FROM day_plan_items i
       JOIN tasks t ON t.id = i.task_id AND t.user_id = i.user_id
       WHERE i.plan_id = ? AND i.user_id = ?
       ORDER BY i.position ASC, i.created_at ASC`
    )
    .all(planId, userId) as PlanItemRow[];
}

function mapPlanItem(row: PlanItemRow, planId = row.plan_id): SmartDayPlanItem {
  return {
    id: row.id,
    planId,
    taskId: row.task_id,
    status: row.status,
    block: row.block,
    startMinute: row.start_minute,
    endMinute: row.end_minute,
    position: row.position,
    reason: row.reason,
    task: mapTask({
      id: row.task_id,
      user_id: row.user_id,
      title: row.task_title,
      description: row.task_description,
      priority: row.task_priority,
      status: row.task_status,
      due_date: row.task_due_date,
      scheduled_date: row.task_scheduled_date,
      project_id: row.task_project_id,
      show_in_week_plan: row.task_show_in_week_plan,
      estimated_minutes: row.task_estimated_minutes,
      energy_level: row.task_energy_level,
      preferred_period: row.task_preferred_period,
      completed_at: row.task_completed_at,
    }),
  };
}

function mapPlan(row: PlanRow, items: PlanItemRow[]): SmartDayPlan {
  return {
    id: row.id,
    date: row.date,
    status: row.status,
    source: row.source,
    version: row.version,
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    confirmedAt: row.confirmed_at ?? undefined,
    items: items.map((item) => mapPlanItem(item, row.id)),
  };
}

function getPlanByDate(userId: string, date: string): SmartDayPlan | null {
  const row = sqlite
    .prepare("SELECT id, user_id, date, status, source, version, summary, created_at, updated_at, confirmed_at FROM day_plans WHERE user_id = ? AND date = ?")
    .get(userId, date) as PlanRow | undefined;
  return row ? mapPlan(row, planItemRows(userId, row.id)) : null;
}

function getPlanById(userId: string, id: string): SmartDayPlan | null {
  const row = planRow(userId, id);
  return row ? mapPlan(row, planItemRows(userId, id)) : null;
}

function focusRows(userId: string, date?: string): FocusRow[] {
  const where = date ? "f.user_id = ? AND f.date = ?" : "f.user_id = ?";
  const values = date ? [userId, date] : [userId];
  return sqlite
    .prepare(
      `SELECT f.id, f.user_id, f.task_id, f.plan_item_id, f.date, f.started_at,
        f.ended_at, f.duration_seconds, f.status, f.created_at, f.updated_at,
        t.title AS task_title
       FROM focus_sessions f
       LEFT JOIN tasks t ON t.id = f.task_id AND t.user_id = f.user_id
       WHERE ${where}
       ORDER BY f.started_at DESC`
    )
    .all(...values) as FocusRow[];
}

function mapFocus(row: FocusRow): FocusSession {
  return {
    id: row.id,
    taskId: row.task_id ?? undefined,
    planItemId: row.plan_item_id ?? undefined,
    date: row.date,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    durationSeconds: row.duration_seconds ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    task: row.task_id && row.task_title ? { id: row.task_id, title: row.task_title } : undefined,
  };
}

export function getFocusSessions(userId: string, date?: string): FocusSession[] {
  if (date !== undefined) requireDate(date);
  return focusRows(userId, date).map(mapFocus);
}

function recordFeedbackInTransaction(
  userId: string,
  input: {
    planId?: string | null;
    taskId?: string | null;
    date: string;
    eventType: string;
    payload?: Record<string, unknown>;
  }
): SmartDayFeedbackEvent {
  const event = {
    id: randomUUID(),
    planId: input.planId ?? undefined,
    taskId: input.taskId ?? undefined,
    date: input.date,
    eventType: input.eventType,
    payload: input.payload ?? {},
    createdAt: now(),
  };
  sqlite
    .prepare(
      `INSERT INTO planning_feedback_events
       (id, user_id, plan_id, task_id, date, event_type, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      event.id,
      userId,
      event.planId ?? null,
      event.taskId ?? null,
      event.date,
      event.eventType,
      JSON.stringify(event.payload),
      event.createdAt
    );
  return event;
}

export function listFeedbackEvents(
  userId: string,
  input: { date?: string; since?: number; limit?: number } = {}
): SmartDayFeedbackEvent[] {
  if (input.date !== undefined) requireDate(input.date);
  const limit = Math.min(
    200,
    Math.max(1, Number.isInteger(input.limit) ? (input.limit as number) : 100)
  );
  const clauses = ["user_id = ?"];
  const values: (string | number)[] = [userId];
  if (input.date) {
    clauses.push("date = ?");
    values.push(input.date);
  }
  if (input.since !== undefined) {
    if (!Number.isInteger(input.since) || input.since < 0) throw new SmartDayError("since 无效");
    clauses.push("created_at >= ?");
    values.push(input.since);
  }
  values.push(limit);
  const rows = sqlite
    .prepare(
      `SELECT id, plan_id, task_id, date, event_type, payload_json, created_at
       FROM planning_feedback_events WHERE ${clauses.join(" AND ")}
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(...values) as {
    id: string;
    plan_id: string | null;
    task_id: string | null;
    date: string;
    event_type: string;
    payload_json: string;
    created_at: number;
  }[];
  return rows.map((row) => ({
    id: row.id,
    planId: row.plan_id ?? undefined,
    taskId: row.task_id ?? undefined,
    date: row.date,
    eventType: row.event_type,
    payload: (parseJson(row.payload_json) as Record<string, unknown> | undefined) ?? {},
    createdAt: row.created_at,
  }));
}

function sortTasks(tasks: SmartDayTask[], settings: SmartDaySettings, date: string): SmartDayTask[] {
  const priorityRank = { P1: 0, P2: 1, P3: 2 } as const;
  const preferred = settings.memoryOverrides.preferredFocusPeriod;
  return [...tasks].sort((first, second) => {
    const firstOverdue = first.dueDate && first.dueDate < date ? 0 : first.dueDate === date ? 1 : 2;
    const secondOverdue = second.dueDate && second.dueDate < date ? 0 : second.dueDate === date ? 1 : 2;
    return (
      firstOverdue - secondOverdue ||
      priorityRank[first.priority] - priorityRank[second.priority] ||
      Number((first.preferredPeriod ?? preferred ?? "anytime") !== preferred) -
        Number((second.preferredPeriod ?? preferred ?? "anytime") !== preferred) ||
      first.title.localeCompare(second.title, "zh-CN")
    );
  });
}

function buildDeterministicDraft(
  tasks: SmartDayTask[],
  settings: SmartDaySettings,
  date: string
): { items: SmartDayDraftItemInput[]; unassignedTaskIds: string[]; summary: string } {
  const cursors = new Map(settings.windows.map((window) => [window.block, window.startMinute]));
  const items: SmartDayDraftItemInput[] = [];
  const unassignedTaskIds: string[] = [];
  let totalMinutes = 0;
  const capacity = settings.capacityMinutes;
  const ordered = sortTasks(tasks.filter((task) => !task.done), settings, date);

  for (const task of ordered) {
    const duration = effectiveTaskMinutes(task, settings);
    const requested = task.preferredPeriod && task.preferredPeriod !== "anytime"
      ? task.preferredPeriod
      : settings.memoryOverrides.preferredFocusPeriod;
    const windows = requested
      ? [
          ...settings.windows.filter((window) => window.block === requested),
          ...settings.windows.filter((window) => window.block !== requested),
        ]
      : settings.windows;
    const available = windows.find((window) => {
      const cursor = cursors.get(window.block) ?? window.startMinute;
      return cursor + duration <= window.endMinute && totalMinutes + duration <= capacity;
    });
    if (!available) {
      unassignedTaskIds.push(task.id);
      continue;
    }
    const startMinute = cursors.get(available.block) ?? available.startMinute;
    const endMinute = startMinute + duration;
    cursors.set(available.block, endMinute);
    totalMinutes += duration;
    items.push({
      taskId: task.id,
      block: available.block,
      startMinute,
      endMinute,
      reason: requested
        ? `按${available.block === requested ? "偏好时段" : "可用时段"}安排`
        : "按优先级、截止日期和可用容量安排",
    });
  }
  return {
    items,
    unassignedTaskIds,
    summary: items.length > 0 ? `已安排 ${items.length} 项，共 ${totalMinutes} 分钟` : "今天暂无可安排任务",
  };
}

function validateDraftForPersistence(
  items: SmartDayDraftItemInput[],
  tasks: SmartDayTask[],
  settings: SmartDaySettings
): SmartDayDraftItemInput[] {
  const value = { items, summary: "" };
  return validateDraftItems(value, tasks, settings).items;
}

export async function createDayPlanDraft(
  userId: string,
  dateInput: string,
  input: { taskIds?: string[]; useAi?: boolean } = {}
): Promise<SmartDayDraftResult> {
  const date = requireDate(dateInput);
  const settings = getSmartDaySettings(userId);
  const tasks = input.taskIds
    ? getOwnedTasks(userId, input.taskIds).filter((task) => !task.done)
    : getCandidateTasks(userId, date);
  const deterministic = buildDeterministicDraft(tasks, settings, date);
  let items = deterministic.items;
  let summary = deterministic.summary;
  let source: "rules" | "ai" = "rules";
  let usedAi = false;
  const warnings: string[] = [];

  if (input.useAi !== false && tasks.length > 0) {
    try {
      const ai = await generateAiDraft(userId, date, tasks, settings);
      if (ai.items.length > 0) {
        items = validateDraftForPersistence(ai.items, tasks, settings);
        summary = ai.summary || `AI 已安排 ${items.length} 项`;
        source = "ai";
        usedAi = true;
      } else {
        warnings.push("AI 未安排任何任务，已使用规则方案");
      }
    } catch (error) {
      warnings.push(error instanceof Error ? `AI 建议不可用，已回退规则：${error.message}` : "AI 建议不可用，已回退规则");
    }
  }

  const selected = new Set(items.map((item) => item.taskId));
  const unassignedTaskIds = tasks.filter((task) => !selected.has(task.id)).map((task) => task.id);
  const timestamp = now();
  let planId = "";
  sqlite.transaction(() => {
    const existing = sqlite
      .prepare("SELECT id, version, created_at FROM day_plans WHERE user_id = ? AND date = ?")
      .get(userId, date) as { id: string; version: number; created_at: number } | undefined;
    planId = existing?.id ?? randomUUID();
    const version = (existing?.version ?? 0) + 1;
    if (existing) {
      sqlite
        .prepare(
          `UPDATE day_plans SET status = 'draft', source = ?, version = ?, summary = ?,
           updated_at = ?, confirmed_at = NULL WHERE id = ? AND user_id = ?`
        )
        .run(source, version, summary, timestamp, planId, userId);
      sqlite.prepare("DELETE FROM day_plan_items WHERE plan_id = ? AND user_id = ?").run(planId, userId);
    } else {
      sqlite
        .prepare(
          `INSERT INTO day_plans
           (id, user_id, date, status, source, version, summary, created_at, updated_at, confirmed_at)
           VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, NULL)`
        )
        .run(planId, userId, date, source, version, summary, timestamp, timestamp);
    }
    const insert = sqlite.prepare(
      `INSERT INTO day_plan_items
       (id, user_id, plan_id, task_id, status, block, start_minute, end_minute, position, reason, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'proposed', ?, ?, ?, ?, ?, ?, ?)`
    );
    items.forEach((item, index) => {
      insert.run(
        randomUUID(),
        userId,
        planId,
        item.taskId,
        item.block,
        item.startMinute,
        item.endMinute,
        index,
        item.reason ?? "",
        timestamp,
        timestamp
      );
    });
    recordFeedbackInTransaction(userId, {
      planId,
      date,
      eventType: "plan_generated",
      payload: { source, itemCount: items.length, usedAi },
    });
  })();
  broadcastChange(userId);
  const plan = getPlanById(userId, planId);
  if (!plan) throw new SmartDayError("计划生成失败", 500);
  return { plan, unassignedTaskIds, warnings, usedAi };
}

export function getSmartDaySnapshot(userId: string, dateInput: string): SmartDaySnapshot {
  const date = requireDate(dateInput);
  const settings = getSmartDaySettings(userId);
  const tasks = getCandidateTasks(userId, date);
  const overdueTasks = tasks.filter((task) => Boolean(task.dueDate && task.dueDate < date));
  const sessions = getFocusSessions(userId, date);
  const active = sessions.find((session) => session.status === "running") ?? null;
  const todayActualMinutes = Math.round(
    sessions
      .filter((session) => session.status === "completed")
      .reduce((total, session) => total + (session.durationSeconds ?? 0), 0) / 60
  );
  return {
    date,
    timezone: "Asia/Shanghai",
    settings,
    tasks,
    overdueTasks,
    plan: getPlanByDate(userId, date),
    focus: { active, sessions, todayActualMinutes },
  };
}

function itemRow(userId: string, itemId: string): PlanItemRow | undefined {
  return sqlite
    .prepare(
      `SELECT i.id, i.user_id, i.plan_id, i.task_id, i.status, i.block,
        i.start_minute, i.end_minute, i.position, i.reason, i.created_at, i.updated_at,
        t.title AS task_title, t.description AS task_description, t.priority AS task_priority,
        t.status AS task_status, t.due_date AS task_due_date, t.scheduled_date AS task_scheduled_date,
        t.project_id AS task_project_id, t.show_in_week_plan AS task_show_in_week_plan,
        t.estimated_minutes AS task_estimated_minutes, t.energy_level AS task_energy_level,
        t.preferred_period AS task_preferred_period, t.completed_at AS task_completed_at
       FROM day_plan_items i
       JOIN tasks t ON t.id = i.task_id AND t.user_id = i.user_id
       WHERE i.id = ? AND i.user_id = ?`
    )
    .get(itemId, userId) as PlanItemRow | undefined;
}

function validateItemTime(
  settings: SmartDaySettings,
  block: SmartDayBlock,
  startMinute: number,
  endMinute: number
): void {
  assertInteger(startMinute, "开始时间", 0, 1439);
  assertInteger(endMinute, "结束时间", 1, 1440);
  if (endMinute <= startMinute) throw new SmartDayError("结束时间必须晚于开始时间");
  const window = settings.windows.find((candidate) => candidate.block === block);
  if (!window || startMinute < window.startMinute || endMinute > window.endMinute) {
    throw new SmartDayError("安排时间超出对应时段");
  }
}

export function updateSmartDayItem(
  userId: string,
  itemId: string,
  input: SmartDayItemActionInput
): SmartDayPlanItem {
  if (!["accept", "reject", "move"].includes(input.action)) throw new SmartDayError("计划操作无效");
  const item = itemRow(userId, itemId);
  if (!item) throw new SmartDayError("计划项不存在", 404);
  const plan = planRow(userId, item.plan_id);
  if (!plan) throw new SmartDayError("计划不存在", 404);
  if (plan.status !== "draft") throw new SmartDayError("只有草案可以调整", 409);
  const settings = getSmartDaySettings(userId);
  const timestamp = now();
  sqlite.transaction(() => {
    if (input.action === "reject") {
      sqlite
        .prepare("UPDATE day_plan_items SET status = 'rejected', updated_at = ? WHERE id = ? AND user_id = ?")
        .run(timestamp, itemId, userId);
      recordFeedbackInTransaction(userId, {
        planId: plan.id,
        taskId: item.task_id,
        date: plan.date,
        eventType: "plan_item_rejected",
      });
    } else {
      const block = input.action === "move" ? input.block : item.block;
      const startMinute = input.action === "move" ? input.startMinute : item.start_minute;
      const endMinute = input.action === "move" ? input.endMinute : item.end_minute;
      if (!block || startMinute === undefined || endMinute === undefined) {
        throw new SmartDayError("移动计划项缺少时间");
      }
      validateItemTime(settings, block, startMinute, endMinute);
      const overlap = sqlite
        .prepare(
          `SELECT 1 FROM day_plan_items
           WHERE plan_id = ? AND user_id = ? AND id <> ? AND status <> 'rejected'
             AND block = ? AND start_minute < ? AND end_minute > ? LIMIT 1`
        )
        .get(plan.id, userId, itemId, block, endMinute, startMinute);
      if (overlap) throw new SmartDayError("计划项与其他任务时间重叠");
      sqlite
        .prepare(
          `UPDATE day_plan_items SET status = 'accepted', block = ?, start_minute = ?, end_minute = ?,
           position = ?, updated_at = ? WHERE id = ? AND user_id = ?`
        )
        .run(
          block,
          startMinute,
          endMinute,
          input.position === undefined ? item.position : Math.max(0, Math.floor(input.position)),
          timestamp,
          itemId,
          userId
        );
      recordFeedbackInTransaction(userId, {
        planId: plan.id,
        taskId: item.task_id,
        date: plan.date,
        eventType: input.action === "move" ? "plan_item_moved" : "plan_item_accepted",
        payload: {
          from: { block: item.block, startMinute: item.start_minute, endMinute: item.end_minute },
          to: { block, startMinute, endMinute },
        },
      });
    }
    const rows = sqlite
      .prepare("SELECT id FROM day_plan_items WHERE plan_id = ? AND user_id = ? ORDER BY position ASC, created_at ASC")
      .all(plan.id, userId) as { id: string }[];
    const updatePosition = sqlite.prepare("UPDATE day_plan_items SET position = ?, updated_at = ? WHERE id = ? AND user_id = ?");
    rows.forEach((row, index) => updatePosition.run(index, timestamp, row.id, userId));
    sqlite.prepare("UPDATE day_plans SET updated_at = ? WHERE id = ? AND user_id = ?").run(timestamp, plan.id, userId);
  })();
  broadcastChange(userId);
  const changed = itemRow(userId, itemId);
  if (!changed) throw new SmartDayError("计划项更新失败", 500);
  return mapPlanItem(changed, plan.id);
}

export function confirmSmartDayPlan(userId: string, planId: string): SmartDayPlan {
  const plan = planRow(userId, planId);
  if (!plan) throw new SmartDayError("计划不存在", 404);
  if (plan.status === "confirmed") return getPlanById(userId, planId)!;
  if (plan.status !== "draft") throw new SmartDayError("该计划无法确认", 409);
  const allItemCount = (
    sqlite
      .prepare("SELECT COUNT(*) AS count FROM day_plan_items WHERE plan_id = ? AND user_id = ?")
      .get(planId, userId) as { count: number }
  ).count;
  const joinedItems = planItemRows(userId, planId);
  if (allItemCount !== joinedItems.length) {
    throw new SmartDayError("计划包含无效的任务关系", 403);
  }
  const items = joinedItems.filter((item) => item.status !== "rejected");
  const timestamp = now();
  sqlite.transaction(() => {
    let maxOrder = (
      sqlite
        .prepare("SELECT COALESCE(MAX(today_sort_order), -1) AS max_order FROM tasks WHERE user_id = ? AND scheduled_date = ?")
        .get(userId, plan.date) as { max_order: number }
    ).max_order;
    const updateTask = sqlite.prepare(
      "UPDATE tasks SET scheduled_date = ?, today_sort_order = ?, updated_at = ? WHERE id = ? AND user_id = ? AND status <> 'done'"
    );
    for (const item of items.sort((a, b) => a.position - b.position)) {
      const current = sqlite
        .prepare("SELECT scheduled_date, today_sort_order FROM tasks WHERE id = ? AND user_id = ?")
        .get(item.task_id, userId) as
        | { scheduled_date: string | null; today_sort_order: number }
        | undefined;
      if (!current) throw new SmartDayError("计划包含不存在或不属于当前用户的任务", 403);
      const order =
        current.scheduled_date === plan.date
          ? current.today_sort_order
          : ++maxOrder;
      updateTask.run(plan.date, order, timestamp, item.task_id, userId);
    }
    sqlite.prepare("UPDATE day_plan_items SET status = CASE WHEN status = 'proposed' THEN 'accepted' ELSE status END, updated_at = ? WHERE plan_id = ? AND user_id = ?").run(timestamp, planId, userId);
    sqlite.prepare("UPDATE day_plans SET status = 'confirmed', confirmed_at = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(timestamp, timestamp, planId, userId);
    recordFeedbackInTransaction(userId, {
      planId,
      date: plan.date,
      eventType: "plan_confirmed",
      payload: { itemCount: items.length },
    });
  })();
  broadcastChange(userId);
  return getPlanById(userId, planId)!;
}

function focusRow(userId: string, id: string): FocusRow | undefined {
  return focusRows(userId).find((row) => row.id === id);
}

export function startFocusSession(
  userId: string,
  input: { taskId?: string; planItemId?: string; date?: string }
): FocusSession {
  let taskId = input.taskId;
  const planItemId = input.planItemId;
  if (taskId !== undefined && typeof taskId !== "string") throw new SmartDayError("任务 ID 无效");
  if (planItemId !== undefined && typeof planItemId !== "string") throw new SmartDayError("计划项 ID 无效");
  const date = input.date === undefined ? todayKey() : requireDate(input.date);
  if (planItemId) {
    const item = sqlite
      .prepare(
        `SELECT i.id, i.task_id, i.user_id, p.date
         FROM day_plan_items i
         JOIN day_plans p ON p.id = i.plan_id AND p.user_id = i.user_id
         WHERE i.id = ? AND i.user_id = ?`
      )
      .get(planItemId, userId) as { id: string; task_id: string; user_id: string; date: string } | undefined;
    if (!item) throw new SmartDayError("计划项不存在或不属于当前用户", 403);
    if (item.date !== date) throw new SmartDayError("专注日期与计划项日期不一致");
    taskId = taskId ?? item.task_id;
    if (taskId && item.task_id !== taskId) throw new SmartDayError("任务与计划项不匹配");
  }
  if (taskId) {
    const task = sqlite
      .prepare("SELECT id, status FROM tasks WHERE id = ? AND user_id = ?")
      .get(taskId, userId) as { id: string; status: string } | undefined;
    if (!task) throw new SmartDayError("任务不存在或不属于当前用户", 403);
    if (task.status === "done") throw new SmartDayError("已完成任务不能开始专注");
  }
  const running = sqlite.prepare("SELECT id, task_id FROM focus_sessions WHERE user_id = ? AND status = 'running'").get(userId) as { id: string; task_id: string | null } | undefined;
  if (running) {
    const existing = focusRow(userId, running.id);
    if (existing && existing.task_id === (taskId ?? null)) return mapFocus(existing);
    throw new SmartDayError("已有一个正在运行的专注会话", 409);
  }
  const timestamp = now();
  const id = randomUUID();
  sqlite.transaction(() => {
    sqlite
      .prepare(
        `INSERT INTO focus_sessions
         (id, user_id, task_id, plan_item_id, date, started_at, ended_at, duration_seconds, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 'running', ?, ?)`
      )
      .run(id, userId, taskId ?? null, planItemId ?? null, date, timestamp, timestamp, timestamp);
    recordFeedbackInTransaction(userId, {
      planId: planItemId ? (sqlite.prepare("SELECT plan_id FROM day_plan_items WHERE id = ? AND user_id = ?").get(planItemId, userId) as { plan_id: string } | undefined)?.plan_id : undefined,
      taskId,
      date,
      eventType: "focus_started",
    });
  })();
  broadcastChange(userId);
  const created = focusRow(userId, id);
  if (!created) throw new SmartDayError("专注会话创建失败", 500);
  return mapFocus(created);
}

export function stopFocusSession(
  userId: string,
  id: string,
  action: "stop" | "cancel" = "stop"
): FocusSession {
  if (action !== "stop" && action !== "cancel") throw new SmartDayError("专注操作无效");
  const current = focusRow(userId, id);
  if (!current) throw new SmartDayError("专注会话不存在", 404);
  if (current.status !== "running") return mapFocus(current);
  const endedAt = now();
  const durationSeconds = action === "cancel" ? 0 : Math.max(0, Math.floor((endedAt - current.started_at) / 1000));
  sqlite.transaction(() => {
    sqlite
      .prepare("UPDATE focus_sessions SET ended_at = ?, duration_seconds = ?, status = ?, updated_at = ? WHERE id = ? AND user_id = ? AND status = 'running'")
      .run(endedAt, durationSeconds, action === "cancel" ? "cancelled" : "completed", endedAt, id, userId);
    recordFeedbackInTransaction(userId, {
      taskId: current.task_id,
      date: current.date,
      eventType: action === "cancel" ? "focus_cancelled" : "focus_stopped",
      payload: { durationSeconds },
    });
  })();
  if (action === "stop" && durationSeconds > 0) {
    try {
      observeMemories(userId);
    } catch (error) {
      console.warn("memory observation skipped after focus session", error instanceof Error ? error.message : error);
    }
  }
  broadcastChange(userId);
  const stopped = focusRow(userId, id);
  if (!stopped) throw new SmartDayError("专注会话更新失败", 500);
  return mapFocus(stopped);
}

function completedTodayTasks(userId: string, date: string): SmartDayTask[] {
  const rows = sqlite
    .prepare(`${taskSelect()} WHERE user_id = ? AND scheduled_date = ? AND status = 'done' ORDER BY today_sort_order ASC, updated_at ASC`)
    .all(userId, date) as TaskRow[];
  return rows.map(mapTask);
}

export type HermesSmartDayKind = "morning" | "overdue" | "evening";

export function getHermesSmartDaySummary(
  userId: string,
  dateInput: string,
  kind: HermesSmartDayKind
): Record<string, unknown> {
  const date = requireDate(dateInput);
  if (!["morning", "overdue", "evening"].includes(kind)) throw new SmartDayError("提醒类型无效");
  const snapshot = getSmartDaySnapshot(userId, date);
  if (kind === "morning") {
    const plan = snapshot.plan;
    return {
      date,
      kind,
      planStatus: plan?.status ?? "none",
      summary: plan?.summary ?? "今天还没有确认的安排",
      items: plan?.items
        .filter((item) => item.status !== "rejected")
        .map((item) => ({
          taskId: item.taskId,
          title: item.task.title,
          priority: item.task.priority,
          block: item.block,
          startMinute: item.startMinute,
          endMinute: item.endMinute,
          estimatedMinutes: effectiveTaskMinutes(item.task, snapshot.settings),
        })) ?? [],
      unplannedCount: snapshot.tasks.filter((task) => !plan?.items.some((item) => item.taskId === task.id && item.status !== "rejected")).length,
      overdueCount: snapshot.overdueTasks.length,
    };
  }
  if (kind === "overdue") {
    return {
      date,
      kind,
      tasks: snapshot.overdueTasks.map((task) => ({
        id: task.id,
        title: task.title,
        priority: task.priority,
        dueDate: task.dueDate,
        estimatedMinutes: effectiveTaskMinutes(task, snapshot.settings),
      })),
    };
  }
  const completed = completedTodayTasks(userId, date);
  const unfinished = snapshot.tasks.filter((task) => task.scheduledDate === date && !task.done);
  const sessions = getFocusSessions(userId, date);
  const plannedMinutes = snapshot.plan?.items
    .filter((item) => item.status !== "rejected")
    .reduce((total, item) => total + item.endMinute - item.startMinute, 0) ?? 0;
  const actualMinutes = Math.round(
    sessions.filter((session) => session.status === "completed").reduce((total, session) => total + (session.durationSeconds ?? 0), 0) / 60
  );
  return {
    date,
    kind,
    completedCount: completed.length,
    completedTasks: completed.map((task) => ({ id: task.id, title: task.title })),
    unfinishedTasks: unfinished.map((task) => ({ id: task.id, title: task.title, priority: task.priority })),
    plannedMinutes,
    actualMinutes,
  };
}
