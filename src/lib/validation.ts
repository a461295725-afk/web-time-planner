import { TaskItem } from "@/lib/mock-data";

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const PRIORITIES = new Set<TaskItem["priority"]>(["P1", "P2", "P3"]);

export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DATE_KEY_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function parseDateKey(value: unknown): string | null {
  return isDateKey(value) ? value : null;
}

export function isPriority(value: unknown): value is TaskItem["priority"] {
  return typeof value === "string" && PRIORITIES.has(value as TaskItem["priority"]);
}

export function parsePriority(
  value: unknown,
  fallback: TaskItem["priority"] = "P2"
): TaskItem["priority"] | null {
  if (value === undefined) return fallback;
  return isPriority(value) ? value : null;
}

export function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateDateInput(
  value: unknown,
  required = false
): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined || value === null || value === "") {
    return required ? { ok: false } : { ok: true, value: null };
  }
  const parsed = parseDateKey(value);
  return parsed ? { ok: true, value: parsed } : { ok: false };
}

const TASK_TEXT_FIELDS = {
  description: { label: "任务描述", maxLength: 5_000 },
  nextAction: { label: "下一步", maxLength: 500 },
  doneDefinition: { label: "完成标准", maxLength: 500 },
  waitingOn: { label: "等待对象", maxLength: 500 },
  blocker: { label: "阻塞原因", maxLength: 500 },
  originRef: { label: "来源引用", maxLength: 500 },
} as const;

export function validateTaskFields(
  input: unknown,
  options: { requireTitle?: boolean } = {}
): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return "任务请求必须是对象";
  }
  const values = input as Record<string, unknown>;
  const hasTitle = Object.prototype.hasOwnProperty.call(values, "title");
  if (options.requireTitle || hasTitle) {
    if (typeof values.title !== "string" || !values.title.trim()) {
      return "任务标题不能为空";
    }
    if (values.title.trim().length > 200) {
      return "任务标题不能超过 200 个字符";
    }
  }
  for (const [field, rule] of Object.entries(TASK_TEXT_FIELDS)) {
    if (!Object.prototype.hasOwnProperty.call(values, field)) continue;
    const value = values[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string") return `${rule.label}必须是文本`;
    if (value.length > rule.maxLength) {
      return `${rule.label}不能超过 ${rule.maxLength} 个字符`;
    }
  }
  return null;
}
