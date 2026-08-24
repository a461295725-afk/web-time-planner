import { randomUUID } from "node:crypto";
import { sqlite } from "@/db";
import { shiftDate, weekStartKey } from "@/lib/date";
import { isDateKey } from "@/lib/validation";
import { broadcastChange } from "@/lib/sse-manager";
import {
  CarryoverResult,
  CarryoverTask,
  DailyStats,
  ReviewInput,
  ReviewMetrics,
  ReviewPeriodType,
  ReviewRecord,
  StalledProject,
  StatsPayload,
} from "@/lib/review-types";

type ReviewRow = {
  id: string;
  period_type: ReviewPeriodType;
  period_start: string;
  period_end: string;
  wins: string;
  blockers: string;
  next_action: string;
  notes: string;
  metrics_json: string;
  created_at: number;
  updated_at: number;
};

type TaskStatsRow = {
  id: string;
  scheduled_date: string | null;
  status: "todo" | "done" | "overdue";
  estimated_minutes: number | null;
  completed_at: number | null;
};

type CarryoverRow = {
  id: string;
  title: string;
  priority: "P1" | "P2" | "P3";
  scheduled_date: string | null;
};

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  due_date: string | null;
  updated_at: number;
};

type ProjectTaskRow = {
  id: string;
  project_id: string | null;
  title: string;
  priority: "P1" | "P2" | "P3";
  status: "todo" | "done" | "overdue";
  due_date: string | null;
  scheduled_date: string | null;
  updated_at: number;
};

type HabitCountRow = { date: string; count: number };
type FocusCountRow = { date: string; seconds: number | null };
type CarryoverCountRow = { source_date: string; count: number };

const CHINA_TIME_ZONE = "Asia/Shanghai";
const DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: CHINA_TIME_ZONE,
});
const PRIORITY_ORDER: Record<"P1" | "P2" | "P3", number> = {
  P1: 0,
  P2: 1,
  P3: 2,
};

const now = () => Date.now();

function invalid(message: string): never {
  throw new Error(message);
}

function requiredDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !isDateKey(value)) {
    invalid(`${field} 日期无效`);
  }
  return value;
}

function requiredPeriodType(value: unknown): ReviewPeriodType {
  if (value !== "daily" && value !== "weekly") invalid("复盘周期无效");
  return value;
}

function periodRange(
  periodType: ReviewPeriodType,
  requestedStart: string
): { start: string; end: string } {
  const start =
    periodType === "weekly" ? weekStartKey(requiredDate(requestedStart, "复盘")) : requiredDate(requestedStart, "复盘");
  return { start, end: periodType === "weekly" ? shiftDate(start, 6) : start };
}

function dateAtChinaMidnight(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00+08:00`).getTime();
}

function endOfDate(dateKey: string): number {
  return dateAtChinaMidnight(shiftDate(dateKey, 1)) - 1;
}

function dateFromTimestamp(timestamp: number): string {
  return DATE_FORMATTER.format(new Date(timestamp));
}

function dateDifference(from: string, to: string): number {
  const fromMs = Date.UTC(
    Number(from.slice(0, 4)),
    Number(from.slice(5, 7)) - 1,
    Number(from.slice(8, 10))
  );
  const toMs = Date.UTC(
    Number(to.slice(0, 4)),
    Number(to.slice(5, 7)) - 1,
    Number(to.slice(8, 10))
  );
  return Math.floor((toMs - fromMs) / 86400000);
}

function dateKeys(from: string, to: string): string[] {
  const result: string[] = [];
  for (let current = from; current <= to; current = shiftDate(current, 1)) {
    result.push(current);
    if (result.length > 367) invalid("统计日期范围不能超过一年");
  }
  return result;
}

function cleanText(value: unknown, field: string, maxLength = 20000): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") invalid(`${field} 必须是文本`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) invalid(`${field} 不能超过 ${maxLength} 个字符`);
  return trimmed;
}

function emptyMetrics(start: string, end: string): ReviewMetrics {
  return {
    periodStart: start,
    periodEnd: end,
    plannedCount: 0,
    plannedDoneCount: 0,
    completedCount: 0,
    plannedMinutes: 0,
    focusedMinutes: 0,
    habitCompleted: 0,
    habitTotal: 0,
    habitRate: 0,
    carryoverCount: 0,
  };
}

function parseStoredMetrics(value: string, start: string, end: string): ReviewMetrics {
  try {
    const parsed = JSON.parse(value) as Partial<ReviewMetrics>;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.plannedCount === "number" &&
      typeof parsed.plannedDoneCount === "number" &&
      typeof parsed.completedCount === "number" &&
      typeof parsed.plannedMinutes === "number" &&
      typeof parsed.focusedMinutes === "number" &&
      typeof parsed.habitCompleted === "number" &&
      typeof parsed.habitTotal === "number" &&
      typeof parsed.habitRate === "number" &&
      typeof parsed.carryoverCount === "number"
    ) {
      return {
        periodStart: start,
        periodEnd: end,
        plannedCount: parsed.plannedCount,
        plannedDoneCount: parsed.plannedDoneCount,
        completedCount: parsed.completedCount,
        plannedMinutes: parsed.plannedMinutes,
        focusedMinutes: parsed.focusedMinutes,
        habitCompleted: parsed.habitCompleted,
        habitTotal: parsed.habitTotal,
        habitRate: parsed.habitRate,
        carryoverCount: parsed.carryoverCount,
      };
    }
  } catch {
    // Old or manually edited rows fall back to the shape-safe zero metrics.
  }
  return emptyMetrics(start, end);
}

function mapReview(row: ReviewRow): ReviewRecord {
  return {
    id: row.id,
    periodType: row.period_type,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    wins: row.wins,
    blockers: row.blockers,
    nextAction: row.next_action,
    notes: row.notes,
    metrics: parseStoredMetrics(row.metrics_json, row.period_start, row.period_end),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function reviewRow(userId: string, periodType: ReviewPeriodType, periodStart: string): ReviewRow | undefined {
  return sqlite
    .prepare(
      `SELECT id, period_type, period_start, period_end, wins, blockers, next_action,
        notes, metrics_json, created_at, updated_at
       FROM reviews
       WHERE user_id = ? AND period_type = ? AND period_start = ?`
    )
    .get(userId, periodType, periodStart) as ReviewRow | undefined;
}

export function getReview(
  userId: string,
  periodType: ReviewPeriodType,
  requestedStart: string
): ReviewRecord | undefined {
  const type = requiredPeriodType(periodType);
  const range = periodRange(type, requestedStart);
  const row = reviewRow(userId, type, range.start);
  return row ? mapReview(row) : undefined;
}

export function listReviews(
  userId: string,
  periodType: ReviewPeriodType,
  from?: string,
  to?: string
): ReviewRecord[] {
  const type = requiredPeriodType(periodType);
  const parsedFrom = from ? requiredDate(from, "复盘起始") : null;
  const parsedTo = to ? requiredDate(to, "复盘结束") : null;
  if (parsedFrom && parsedTo && parsedFrom > parsedTo) invalid("复盘日期范围无效");
  const rows = sqlite
    .prepare(
      `SELECT id, period_type, period_start, period_end, wins, blockers, next_action,
        notes, metrics_json, created_at, updated_at
       FROM reviews
       WHERE user_id = ? AND period_type = ?
         AND (? IS NULL OR period_start >= ?)
         AND (? IS NULL OR period_start <= ?)
       ORDER BY period_start DESC
       LIMIT 100`
    )
    .all(userId, type, parsedFrom, parsedFrom, parsedTo, parsedTo) as ReviewRow[];
  return rows.map(mapReview);
}

export function getReviewStats(userId: string, requestedFrom: string, requestedTo: string): StatsPayload {
  const from = requiredDate(requestedFrom, "统计起始");
  const to = requiredDate(requestedTo, "统计结束");
  if (from > to) invalid("统计日期范围无效");
  const keys = dateKeys(from, to);
  const endTimestamp = endOfDate(to);
  const startTimestamp = dateAtChinaMidnight(from);
  const metricsByDate = new Map<string, DailyStats>();
  keys.forEach((date) =>
    metricsByDate.set(date, {
      date,
      ...emptyMetrics(date, date),
    })
  );

  const tasks = sqlite
    .prepare(
      `SELECT id, scheduled_date, status, estimated_minutes, completed_at
       FROM tasks
       WHERE user_id = ?
         AND (scheduled_date BETWEEN ? AND ? OR completed_at BETWEEN ? AND ?)`
    )
    .all(userId, from, to, startTimestamp, endTimestamp) as TaskStatsRow[];

  for (const task of tasks) {
    if (task.scheduled_date && metricsByDate.has(task.scheduled_date)) {
      const metrics = metricsByDate.get(task.scheduled_date)!;
      metrics.plannedCount += 1;
      if (task.status === "done") metrics.plannedDoneCount += 1;
      metrics.plannedMinutes += task.estimated_minutes ?? 0;
    }
    if (task.completed_at !== null) {
      const completedDate = dateFromTimestamp(task.completed_at);
      const metrics = metricsByDate.get(completedDate);
      if (metrics) metrics.completedCount += 1;
    }
  }

  const focusRows = sqlite
    .prepare(
      `SELECT date, SUM(duration_seconds) AS seconds
       FROM focus_sessions
       WHERE user_id = ? AND status = 'completed' AND date BETWEEN ? AND ?
       GROUP BY date`
    )
    .all(userId, from, to) as FocusCountRow[];
  for (const row of focusRows) {
    const metrics = metricsByDate.get(row.date);
    if (metrics) metrics.focusedMinutes = Math.max(0, Math.round((row.seconds ?? 0) / 60));
  }

  const habitTotal = (
    sqlite.prepare("SELECT COUNT(*) AS count FROM habits WHERE user_id = ?").get(userId) as { count: number }
  ).count;
  const habitRows = sqlite
    .prepare(
      `SELECT date, COUNT(DISTINCT habit_id) AS count
       FROM habit_logs
       WHERE user_id = ? AND date BETWEEN ? AND ?
       GROUP BY date`
    )
    .all(userId, from, to) as HabitCountRow[];
  for (const row of habitRows) {
    const metrics = metricsByDate.get(row.date);
    if (!metrics) continue;
    metrics.habitCompleted = row.count;
    metrics.habitTotal = habitTotal;
    metrics.habitRate = habitTotal > 0 ? Math.min(1, row.count / habitTotal) : 0;
  }
  for (const metrics of metricsByDate.values()) {
    if (metrics.habitTotal === 0) metrics.habitTotal = habitTotal;
  }

  const carryoverRows = sqlite
    .prepare(
      `SELECT source_date, COUNT(*) AS count
       FROM task_carryovers
       WHERE user_id = ? AND source_date BETWEEN ? AND ?
       GROUP BY source_date`
    )
    .all(userId, from, to) as CarryoverCountRow[];
  for (const row of carryoverRows) {
    const metrics = metricsByDate.get(row.source_date);
    if (metrics) metrics.carryoverCount = row.count;
  }

  const days = keys.map((date) => metricsByDate.get(date)!);
  const totals = days.reduce<ReviewMetrics>(
    (sum, day) => ({
      periodStart: from,
      periodEnd: to,
      plannedCount: sum.plannedCount + day.plannedCount,
      plannedDoneCount: sum.plannedDoneCount + day.plannedDoneCount,
      completedCount: sum.completedCount + day.completedCount,
      plannedMinutes: sum.plannedMinutes + day.plannedMinutes,
      focusedMinutes: sum.focusedMinutes + day.focusedMinutes,
      habitCompleted: sum.habitCompleted + day.habitCompleted,
      habitTotal: sum.habitTotal + day.habitTotal,
      habitRate: 0,
      carryoverCount: sum.carryoverCount + day.carryoverCount,
    }),
    emptyMetrics(from, to)
  );
  totals.habitRate = totals.habitTotal > 0 ? Math.min(1, totals.habitCompleted / totals.habitTotal) : 0;
  return { from, to, days, totals };
}

export function saveReview(userId: string, input: ReviewInput): ReviewRecord {
  const periodType = requiredPeriodType(input.periodType);
  const range = periodRange(periodType, input.periodStart);
  const metrics = getReviewStats(userId, range.start, range.end).totals;
  const wins = cleanText(input.wins, "完成与收获");
  const blockers = cleanText(input.blockers, "阻塞因素");
  const nextAction = cleanText(input.nextAction, "下一步行动");
  const notes = cleanText(input.notes, "备注");
  const timestamp = now();
  const result = sqlite.transaction(() => {
    const existing = reviewRow(userId, periodType, range.start);
    if (existing) {
      sqlite
        .prepare(
          `UPDATE reviews
           SET period_end = ?, wins = ?, blockers = ?, next_action = ?, notes = ?,
             metrics_json = ?, updated_at = ?
           WHERE id = ? AND user_id = ?`
        )
        .run(
          range.end,
          wins,
          blockers,
          nextAction,
          notes,
          JSON.stringify(metrics),
          timestamp,
          existing.id,
          userId
        );
      return reviewRow(userId, periodType, range.start)!;
    }
    const id = randomUUID();
    sqlite
      .prepare(
        `INSERT INTO reviews
         (id, user_id, period_type, period_start, period_end, wins, blockers, next_action,
          notes, metrics_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        userId,
        periodType,
        range.start,
        range.end,
        wins,
        blockers,
        nextAction,
        notes,
        JSON.stringify(metrics),
        timestamp,
        timestamp
      );
    return reviewRow(userId, periodType, range.start)!;
  })();
  broadcastChange(userId);
  return mapReview(result);
}

function carryoverTask(value: CarryoverRow, action: CarryoverTask["action"]): CarryoverTask {
  return { id: value.id, title: value.title, priority: value.priority, action };
}

export function applyCarryover(userId: string, requestedSourceDate: string, requestedTargetDate: string): CarryoverResult {
  const sourceDate = requiredDate(requestedSourceDate, "结转来源");
  const targetDate = requiredDate(requestedTargetDate, "结转目标");
  if (targetDate !== shiftDate(sourceDate, 1)) invalid("结转目标必须是来源日期的次日");

  const result = sqlite.transaction(() => {
    const candidates = sqlite
      .prepare(
        `SELECT id, title, priority, scheduled_date
         FROM tasks
         WHERE user_id = ? AND status <> 'done' AND scheduled_date = ?
         ORDER BY CASE priority WHEN 'P1' THEN 0 WHEN 'P2' THEN 1 ELSE 2 END, today_sort_order ASC, created_at ASC`
      )
      .all(userId, sourceDate) as CarryoverRow[];
    const existingHistory = (
      sqlite
        .prepare(
          `SELECT COUNT(*) AS count
           FROM task_carryovers
           WHERE user_id = ? AND source_date = ? AND target_date = ?`
        )
        .get(userId, sourceDate, targetDate) as { count: number }
    ).count;
    const moved: CarryoverTask[] = [];
    const returnedToWeek: CarryoverTask[] = [];
    const skipped: CarryoverTask[] = [];
    for (const task of candidates) {
      const action: CarryoverTask["action"] = task.priority === "P1" ? "move_next_day" : "return_to_week";
      const inserted = sqlite
        .prepare(
          `INSERT OR IGNORE INTO task_carryovers
           (id, user_id, task_id, source_date, target_date, action, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(randomUUID(), userId, task.id, sourceDate, targetDate, action, now());
      if (inserted.changes === 0) {
        skipped.push(carryoverTask(task, action));
        continue;
      }
      const changed =
        action === "move_next_day"
          ? sqlite
              .prepare(
                `UPDATE tasks
                 SET scheduled_date = ?, updated_at = ?
                 WHERE id = ? AND user_id = ? AND status <> 'done' AND scheduled_date = ?`
              )
              .run(targetDate, now(), task.id, userId, sourceDate).changes
          : sqlite
              .prepare(
                `UPDATE tasks
                 SET scheduled_date = NULL, show_in_week_plan = 1, updated_at = ?
                 WHERE id = ? AND user_id = ? AND status <> 'done' AND scheduled_date = ?`
              )
              .run(now(), task.id, userId, sourceDate).changes;
      if (changed === 0) {
        sqlite
          .prepare(
            "DELETE FROM task_carryovers WHERE user_id = ? AND task_id = ? AND source_date = ? AND target_date = ?"
          )
          .run(userId, task.id, sourceDate, targetDate);
        skipped.push(carryoverTask(task, action));
      } else if (action === "move_next_day") {
        moved.push(carryoverTask(task, action));
      } else {
        returnedToWeek.push(carryoverTask(task, action));
      }
    }
    return {
      sourceDate,
      targetDate,
      moved,
      returnedToWeek,
      skipped,
      alreadyApplied:
        existingHistory > 0 && moved.length === 0 && returnedToWeek.length === 0,
    } satisfies CarryoverResult;
  })();
  if (result.moved.length + result.returnedToWeek.length > 0) broadcastChange(userId);
  return result;
}

export function getStalledProjects(userId: string, requestedAsOf: string, requestedIdleDays = 7): StalledProject[] {
  const asOf = requiredDate(requestedAsOf, "停滞项目");
  if (!Number.isInteger(requestedIdleDays) || requestedIdleDays < 1 || requestedIdleDays > 365) {
    invalid("停滞天数必须在 1 到 365 之间");
  }
  const projects = sqlite
    .prepare(
      `SELECT id, name, description, due_date, updated_at
       FROM projects WHERE user_id = ?
       ORDER BY updated_at ASC, created_at ASC`
    )
    .all(userId) as ProjectRow[];
  const tasks = sqlite
    .prepare(
      `SELECT id, project_id, title, priority, status, due_date, scheduled_date, updated_at
       FROM tasks WHERE user_id = ? AND project_id IS NOT NULL`
    )
    .all(userId) as ProjectTaskRow[];
  const result: StalledProject[] = [];
  for (const project of projects) {
    const openTasks = tasks.filter((task) => task.project_id === project.id && task.status !== "done");
    if (openTasks.length === 0) continue;
    const lastActivityAt = Math.max(
      project.updated_at || 0,
      ...tasks.filter((task) => task.project_id === project.id).map((task) => task.updated_at || 0)
    );
    const lastActivityDate = dateFromTimestamp(lastActivityAt);
    const idleDays = Math.max(0, dateDifference(lastActivityDate, asOf));
    if (idleDays < requestedIdleDays) continue;
    const next = [...openTasks].sort((a, b) => {
      const priority = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (priority !== 0) return priority;
      const aDue = a.due_date ?? "9999-99-99";
      const bDue = b.due_date ?? "9999-99-99";
      if (aDue !== bDue) return aDue.localeCompare(bDue);
      return a.updated_at - b.updated_at;
    })[0];
    result.push({
      id: project.id,
      name: project.name,
      description: project.description,
      dueDate: project.due_date,
      lastActivityAt,
      idleDays,
      openTaskCount: openTasks.length,
      nextAction: next
        ? {
            id: next.id,
            title: next.title,
            priority: next.priority,
            dueDate: next.due_date,
          }
        : null,
    });
  }
  return result.sort((a, b) => b.idleDays - a.idleDays || a.name.localeCompare(b.name));
}
