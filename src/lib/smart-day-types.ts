import type { TaskItem } from "@/lib/mock-data";

export type SmartDayBlock = "morning" | "afternoon" | "evening";
export type SmartDayPlanStatus = "draft" | "confirmed" | "rejected";
export type SmartDayPlanSource = "rules" | "ai" | "manual";
export type SmartDayPlanItemStatus = "proposed" | "accepted" | "rejected";
export type FocusSessionStatus = "running" | "completed" | "cancelled";

export interface SmartDayWindow {
  block: SmartDayBlock;
  startMinute: number;
  endMinute: number;
}

export interface SmartDaySettings {
  timezone: "Asia/Shanghai";
  windows: SmartDayWindow[];
  capacityMinutes: number;
  memoryOverrides: {
    dailyCapacityMinutes?: number;
    preferredFocusPeriod?: SmartDayBlock;
    defaultEstimatedMinutes?: number;
    estimateMultiplier?: number;
  };
}

export interface SmartDayTask {
  id: string;
  title: string;
  description?: string;
  priority: TaskItem["priority"];
  done: boolean;
  dueDate: string;
  scheduledDate?: string;
  projectId?: string;
  showInWeekPlan?: boolean;
  estimatedMinutes?: number;
  energyLevel?: TaskItem["energyLevel"];
  preferredPeriod?: TaskItem["preferredPeriod"];
  completedAt?: number;
}

export interface SmartDayPlanItem {
  id: string;
  planId: string;
  taskId: string;
  status: SmartDayPlanItemStatus;
  block: SmartDayBlock;
  startMinute: number;
  endMinute: number;
  position: number;
  reason: string;
  task: SmartDayTask;
}

export interface SmartDayPlan {
  id: string;
  userId?: string;
  date: string;
  status: SmartDayPlanStatus;
  source: SmartDayPlanSource;
  version: number;
  summary: string;
  createdAt: number;
  updatedAt: number;
  confirmedAt?: number;
  items: SmartDayPlanItem[];
}

export interface FocusSession {
  id: string;
  taskId?: string;
  planItemId?: string;
  date: string;
  startedAt: number;
  endedAt?: number;
  durationSeconds?: number;
  status: FocusSessionStatus;
  createdAt: number;
  updatedAt: number;
  task?: Pick<SmartDayTask, "id" | "title">;
}

export interface SmartDayFeedbackEvent {
  id: string;
  planId?: string;
  taskId?: string;
  date: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

export interface SmartDaySnapshot {
  date: string;
  timezone: "Asia/Shanghai";
  settings: SmartDaySettings;
  tasks: SmartDayTask[];
  overdueTasks: SmartDayTask[];
  plan: SmartDayPlan | null;
  focus: {
    active: FocusSession | null;
    sessions: FocusSession[];
    todayActualMinutes: number;
  };
}

export interface SmartDayDraftItemInput {
  taskId: string;
  block: SmartDayBlock;
  startMinute: number;
  endMinute: number;
  reason?: string;
}

export interface SmartDayDraftResult {
  plan: SmartDayPlan;
  unassignedTaskIds: string[];
  warnings: string[];
  usedAi: boolean;
}

export interface SmartDayItemActionInput {
  action: "accept" | "reject" | "move";
  block?: SmartDayBlock;
  startMinute?: number;
  endMinute?: number;
  position?: number;
}

export const DEFAULT_SMART_DAY_WINDOWS: SmartDayWindow[] = [
  { block: "morning", startMinute: 9 * 60, endMinute: 12 * 60 },
  { block: "afternoon", startMinute: 13 * 60 + 30, endMinute: 18 * 60 },
  { block: "evening", startMinute: 19 * 60 + 30, endMinute: 22 * 60 },
];

export const DEFAULT_SMART_DAY_CAPACITY_MINUTES = 360;
export const DEFAULT_TASK_ESTIMATED_MINUTES = 30;

export function effectiveTaskMinutes(
  task: Pick<SmartDayTask, "estimatedMinutes">,
  settings: SmartDaySettings
): number {
  const base = task.estimatedMinutes
    ?? settings.memoryOverrides.defaultEstimatedMinutes
    ?? DEFAULT_TASK_ESTIMATED_MINUTES;
  const multiplier = settings.memoryOverrides.estimateMultiplier ?? 1;
  return Math.max(5, Math.min(1440, Math.round((base * multiplier) / 5) * 5));
}

export function blockLabel(block: SmartDayBlock): string {
  return { morning: "上午", afternoon: "下午", evening: "晚上" }[block];
}

export function formatMinute(minute: number): string {
  const hour = Math.floor(minute / 60).toString().padStart(2, "0");
  const min = (minute % 60).toString().padStart(2, "0");
  return `${hour}:${min}`;
}
