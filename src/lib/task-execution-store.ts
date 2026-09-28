import { randomUUID } from "node:crypto";
import { sqlite } from "@/db";
import { broadcastChange } from "@/lib/sse-manager";
import { getTask } from "@/lib/server-store";
import { isDateKey } from "@/lib/validation";

export type TaskOutcomeKind = "done" | "partial" | "postponed" | "dropped";

export interface TaskOutcome {
  id: string;
  taskId: string;
  date: string;
  outcome: TaskOutcomeKind;
  note: string;
  nextAction?: string;
  actualMinutes?: number;
  source: string;
  createdAt: number;
}

export interface TaskOutcomeWithTask extends TaskOutcome {
  taskTitle: string;
}

type TaskOutcomeRow = {
  id: string;
  task_id: string;
  date: string;
  outcome: TaskOutcomeKind;
  note: string;
  next_action: string | null;
  actual_minutes: number | null;
  source: string;
  created_at: number;
};

function invalid(message: string): never {
  throw new Error(message);
}

function cleanText(value: unknown, field: string, maxLength = 2_000): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") invalid(`${field}无效`);
  const cleaned = value.trim();
  if (cleaned.length > maxLength) invalid(`${field}过长`);
  return cleaned;
}

function mapOutcome(row: TaskOutcomeRow): TaskOutcome {
  return {
    id: row.id,
    taskId: row.task_id,
    date: row.date,
    outcome: row.outcome,
    note: row.note,
    nextAction: row.next_action ?? undefined,
    actualMinutes: row.actual_minutes ?? undefined,
    source: row.source,
    createdAt: row.created_at,
  };
}

function outcomeRow(userId: string, id: string): TaskOutcomeRow {
  return sqlite
    .prepare(
      `SELECT id, task_id, date, outcome, note, next_action, actual_minutes, source, created_at
       FROM task_outcomes WHERE id = ? AND user_id = ?`
    )
    .get(id, userId) as TaskOutcomeRow;
}

export function recordTaskOutcome(
  userId: string,
  taskId: string,
  input: {
    date: string;
    outcome: TaskOutcomeKind;
    note?: string;
    nextAction?: string;
    actualMinutes?: number;
    source?: string;
    rescheduleDate?: string;
    waitingOn?: string;
    followUpDate?: string;
    blocker?: string;
  }
): { outcome: TaskOutcome; task: NonNullable<ReturnType<typeof getTask>> } {
  if (!isDateKey(input.date)) invalid("结果日期无效");
  if (!["done", "partial", "postponed", "dropped"].includes(input.outcome)) {
    invalid("任务结果无效");
  }
  if (
    input.actualMinutes !== undefined &&
    (!Number.isInteger(input.actualMinutes) || input.actualMinutes < 0 || input.actualMinutes > 1440)
  ) {
    invalid("实际时长必须是 0 到 1440 分钟的整数");
  }
  if (input.rescheduleDate !== undefined && !isDateKey(input.rescheduleDate)) {
    invalid("重新安排日期无效");
  }
  if (input.followUpDate !== undefined && !isDateKey(input.followUpDate)) {
    invalid("跟进日期无效");
  }
  if (!getTask(userId, taskId)) invalid("任务不存在");

  const result = sqlite.transaction(() => {
    const id = randomUUID();
    const timestamp = Date.now();
    const note = cleanText(input.note, "结果说明");
    const nextAction = cleanText(input.nextAction, "下一步", 500) || null;
    const source = cleanText(input.source, "来源", 100) || "manual";
    const waitingOn = cleanText(input.waitingOn, "等待对象", 500) || null;
    const blocker = cleanText(input.blocker, "阻塞原因", 500) || null;
    const rescheduleDate = input.rescheduleDate ?? null;
    const followUpDate = input.followUpDate ?? null;
    sqlite
      .prepare(
        `INSERT INTO task_outcomes
         (id, user_id, task_id, date, outcome, note, next_action, actual_minutes, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        userId,
        taskId,
        input.date,
        input.outcome,
        note,
        nextAction,
        input.actualMinutes ?? null,
        source,
        timestamp
      );

    const closesTask = input.outcome === "done" || input.outcome === "dropped";
    sqlite
      .prepare(
        `UPDATE tasks
         SET status = ?, completed_at = ?, completion_outcome = ?, last_outcome_at = ?,
           next_action = COALESCE(?, next_action), execution_state = ?,
           scheduled_date = COALESCE(?, scheduled_date), due_date = COALESCE(?, due_date),
           waiting_on = ?, follow_up_date = ?, blocker = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`
      )
      .run(
        closesTask ? "done" : "todo",
        closesTask ? timestamp : null,
        closesTask ? input.outcome : null,
        timestamp,
        nextAction,
        input.outcome === "postponed" ? "waiting" : "active",
        rescheduleDate,
        rescheduleDate,
        input.outcome === "postponed" ? waitingOn : null,
        input.outcome === "postponed" ? followUpDate : null,
        blocker,
        timestamp,
        taskId,
        userId
      );
    sqlite
      .prepare(
        `INSERT INTO planning_feedback_events
         (id, user_id, plan_id, task_id, date, event_type, payload_json, created_at)
         VALUES (?, ?, NULL, ?, ?, 'task_outcome', ?, ?)`
      )
      .run(
        randomUUID(),
        userId,
        taskId,
        input.date,
        JSON.stringify({
          outcome: input.outcome,
          actualMinutes: input.actualMinutes ?? null,
          nextAction,
          source,
          rescheduleDate,
          waitingOn,
          followUpDate,
          blocker,
        }),
        timestamp
      );
    return {
      outcome: mapOutcome(outcomeRow(userId, id)),
      task: getTask(userId, taskId)!,
    };
  })();
  broadcastChange(userId);
  return result;
}

export function listTaskOutcomesInRange(
  userId: string,
  from: string,
  to: string
): TaskOutcomeWithTask[] {
  if (!isDateKey(from) || !isDateKey(to) || from > to) invalid("结果日期范围无效");
  const rows = sqlite
    .prepare(
      `SELECT o.id, o.task_id, o.date, o.outcome, o.note, o.next_action,
        o.actual_minutes, o.source, o.created_at, t.title AS task_title
       FROM task_outcomes o
       JOIN tasks t ON t.id = o.task_id AND t.user_id = o.user_id
       WHERE o.user_id = ? AND o.date BETWEEN ? AND ?
       ORDER BY o.date ASC, o.created_at ASC`
    )
    .all(userId, from, to) as (TaskOutcomeRow & { task_title: string })[];
  return rows.map((row) => ({ ...mapOutcome(row), taskTitle: row.task_title }));
}

export function listTaskOutcomes(userId: string, taskId: string): TaskOutcome[] {
  if (!getTask(userId, taskId)) return [];
  const rows = sqlite
    .prepare(
      `SELECT id, task_id, date, outcome, note, next_action, actual_minutes, source, created_at
       FROM task_outcomes
       WHERE user_id = ? AND task_id = ?
       ORDER BY created_at DESC`
    )
    .all(userId, taskId) as TaskOutcomeRow[];
  return rows.map(mapOutcome);
}
