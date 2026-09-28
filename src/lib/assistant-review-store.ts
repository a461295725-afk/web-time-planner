import { shiftDate, weekStartKey } from "@/lib/date";
import { getReview, getReviewStats } from "@/lib/review-store";
import type { ReviewMetrics, ReviewPeriodType } from "@/lib/review-types";
import { getTasks } from "@/lib/server-store";
import { getSmartDaySnapshot } from "@/lib/smart-day-store";
import {
  listTaskOutcomesInRange,
  type TaskOutcomeKind,
} from "@/lib/task-execution-store";
import { isDateKey } from "@/lib/validation";

export interface AssistantReviewDraft {
  periodType: ReviewPeriodType;
  periodStart: string;
  periodEnd: string;
  metrics: ReviewMetrics;
  facts: Record<`${TaskOutcomeKind}Count`, number>;
  wins: string[];
  blockers: string[];
  nextActions: string[];
  notes: string[];
}

function unique(values: (string | undefined)[], limit = 10): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim())))).slice(
    0,
    limit
  );
}

function periodRange(periodType: ReviewPeriodType, requestedStart: string) {
  if (!isDateKey(requestedStart)) throw new Error("复盘日期无效");
  const start = periodType === "weekly" ? weekStartKey(requestedStart) : requestedStart;
  return { start, end: periodType === "weekly" ? shiftDate(start, 6) : start };
}

export function buildAssistantReviewDraft(
  userId: string,
  periodType: ReviewPeriodType,
  requestedStart: string
): AssistantReviewDraft {
  if (periodType !== "daily" && periodType !== "weekly") throw new Error("复盘周期无效");
  const range = periodRange(periodType, requestedStart);
  const outcomes = listTaskOutcomesInRange(userId, range.start, range.end);
  const tasks = getTasks(userId);
  const counts = {
    doneCount: outcomes.filter((item) => item.outcome === "done").length,
    partialCount: outcomes.filter((item) => item.outcome === "partial").length,
    postponedCount: outcomes.filter((item) => item.outcome === "postponed").length,
    droppedCount: outcomes.filter((item) => item.outcome === "dropped").length,
  };
  const metrics = getReviewStats(userId, range.start, range.end).totals;

  const wins = unique([
    ...outcomes
      .filter((item) => item.outcome === "done")
      .map((item) => `完成：${item.taskTitle}${item.actualMinutes !== undefined ? `（${item.actualMinutes} 分钟）` : ""}`),
    counts.partialCount > 0 ? `有 ${counts.partialCount} 项记录了明确的部分进展` : undefined,
    metrics.focusedMinutes > 0 ? `累计专注 ${metrics.focusedMinutes} 分钟` : undefined,
  ]);
  const blockers = unique([
    ...outcomes
      .filter((item) => item.outcome === "postponed")
      .map((item) => `推迟：${item.taskTitle}${item.note ? `（${item.note}）` : ""}`),
    ...outcomes
      .filter((item) => item.outcome === "dropped")
      .map((item) => `放弃：${item.taskTitle}${item.note ? `（${item.note}）` : ""}`),
    ...tasks
      .filter((task) => !task.done && task.executionState === "blocked")
      .map((task) => `阻塞：${task.title}${task.blocker ? `（${task.blocker}）` : ""}`),
    ...tasks
      .filter((task) => !task.done && task.executionState === "waiting")
      .map((task) => `等待：${task.title}${task.waitingOn ? `（${task.waitingOn}）` : ""}`),
  ]);
  const nextActions = unique([
    ...outcomes
      .filter((item) => item.outcome === "partial" || item.outcome === "postponed")
      .map((item) => item.nextAction && `${item.taskTitle}：${item.nextAction}`),
    ...tasks
      .filter((task) => !task.done && task.nextAction)
      .map((task) => `${task.title}：${task.nextAction}`),
  ]);
  const notes = unique([
    `计划 ${metrics.plannedCount} 项，计划内完成 ${metrics.plannedDoneCount} 项，实际完成 ${metrics.completedCount} 项`,
    metrics.habitTotal > 0
      ? `习惯完成率 ${Math.round(metrics.habitRate * 100)}%（${metrics.habitCompleted}/${metrics.habitTotal}）`
      : undefined,
    metrics.carryoverCount > 0 ? `发生 ${metrics.carryoverCount} 次结转` : undefined,
  ]);

  return {
    periodType,
    periodStart: range.start,
    periodEnd: range.end,
    metrics,
    facts: counts,
    wins,
    blockers,
    nextActions,
    notes,
  };
}

export function buildAssistantHandoff(
  userId: string,
  date: string,
  kind: "morning" | "evening"
) {
  if (!isDateKey(date)) throw new Error("交接日期无效");
  if (kind !== "morning" && kind !== "evening") throw new Error("交接类型无效");
  const snapshot = getSmartDaySnapshot(userId, date);
  const tasks = getTasks(userId);
  const followUps = tasks.filter(
    (task) =>
      !task.done &&
      task.executionState === "waiting" &&
      Boolean(task.followUpDate && task.followUpDate <= date)
  );
  if (kind === "morning") {
    return {
      date,
      kind,
      timezone: "Asia/Shanghai" as const,
      plan: snapshot.plan,
      scheduledTasks: tasks.filter((task) => !task.done && task.scheduledDate === date),
      overdueTasks: snapshot.overdueTasks,
      followUps,
      blockedTasks: tasks.filter((task) => !task.done && task.executionState === "blocked"),
      confirmedMemoryOverrides: snapshot.settings.memoryOverrides,
    };
  }
  const outcomes = listTaskOutcomesInRange(userId, date, date);
  return {
    date,
    kind,
    timezone: "Asia/Shanghai" as const,
    outcomes,
    unfinishedTasks: tasks.filter((task) => !task.done && task.scheduledDate === date),
    activeFocus: snapshot.focus.active,
    focusedMinutes: snapshot.focus.todayActualMinutes,
    savedReview: getReview(userId, "daily", date) ?? null,
    followUps,
  };
}

