import { requestAi } from "@/lib/ai-service";
import {
  effectiveTaskMinutes,
  SmartDayBlock,
  SmartDayDraftItemInput,
  SmartDaySettings,
  SmartDayTask,
} from "@/lib/smart-day-types";

const BLOCKS: SmartDayBlock[] = ["morning", "afternoon", "evening"];

export interface ValidatedAiDraft {
  items: SmartDayDraftItemInput[];
  summary: string;
}

function isBlock(value: unknown): value is SmartDayBlock {
  return typeof value === "string" && BLOCKS.includes(value as SmartDayBlock);
}

function integerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function cleanReason(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 240) : "";
}

function isInsideWindow(
  item: Pick<SmartDayDraftItemInput, "block" | "startMinute" | "endMinute">,
  settings: SmartDaySettings
): boolean {
  const window = settings.windows.find((candidate) => candidate.block === item.block);
  return Boolean(
    window &&
      item.startMinute >= window.startMinute &&
      item.endMinute <= window.endMinute
  );
}

function hasOverlap(
  item: SmartDayDraftItemInput,
  items: SmartDayDraftItemInput[]
): boolean {
  return items.some(
    (other) =>
      other.block === item.block &&
      item.startMinute < other.endMinute &&
      item.endMinute > other.startMinute
  );
}

/**
 * Validate the model's scheduling output before it is allowed near SQLite.
 * The model may omit tasks, but it may not invent IDs, periods, times, overlap,
 * or a plan that exceeds the user's capacity.
 */
export function validateDraftItems(
  value: unknown,
  tasks: SmartDayTask[],
  settings: SmartDaySettings
): ValidatedAiDraft {
  if (!value || typeof value !== "object") throw new Error("AI 计划格式无效");
  const record = value as { items?: unknown; summary?: unknown };
  if (!Array.isArray(record.items)) throw new Error("AI 计划缺少 items");

  const taskIds = new Set(tasks.filter((task) => !task.done).map((task) => task.id));
  const seen = new Set<string>();
  const items: SmartDayDraftItemInput[] = [];
  let totalMinutes = 0;

  for (const candidate of record.items.slice(0, tasks.length)) {
    if (!candidate || typeof candidate !== "object") throw new Error("AI 计划项格式无效");
    const item = candidate as Record<string, unknown>;
    const taskId = item.taskId;
    const block = item.block;
    const startMinute = item.startMinute;
    const endMinute = item.endMinute;
    if (
      typeof taskId !== "string" ||
      !taskIds.has(taskId) ||
      seen.has(taskId) ||
      !isBlock(block) ||
      !integerInRange(startMinute, 0, 1439) ||
      !integerInRange(endMinute, 1, 1440) ||
      endMinute <= startMinute
    ) {
      throw new Error("AI 计划包含非法任务或时间");
    }
    const normalized: SmartDayDraftItemInput = {
      taskId,
      block,
      startMinute,
      endMinute,
      reason: cleanReason(item.reason),
    };
    if (!isInsideWindow(normalized, settings)) throw new Error("AI 计划超出工作时段");
    if (hasOverlap(normalized, items)) throw new Error("AI 计划存在时间重叠");
    totalMinutes += endMinute - startMinute;
    if (totalMinutes > settings.capacityMinutes) throw new Error("AI 计划超过每日容量");
    seen.add(taskId);
    items.push(normalized);
  }

  return {
    items,
    summary: typeof record.summary === "string" ? record.summary.trim().slice(0, 500) : "",
  };
}

function parseJson(text: string): unknown {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as unknown;
  } catch {
    throw new Error("模型未返回可识别的计划 JSON");
  }
}

export async function generateAiDraft(
  userId: string,
  date: string,
  tasks: SmartDayTask[],
  settings: SmartDaySettings
): Promise<ValidatedAiDraft> {
  const compactTasks = tasks.slice(0, 80).map((task) => ({
    id: task.id,
    title: task.title,
    priority: task.priority,
    dueDate: task.dueDate || null,
    estimatedMinutes: effectiveTaskMinutes(task, settings),
    energyLevel: task.energyLevel ?? null,
    preferredPeriod: task.preferredPeriod ?? null,
  }));
  const prompt = [
    "你是个人时间安排助手，只能返回 JSON，不要输出 Markdown 或解释文字。",
    `日期：${date}`,
    `时区：${settings.timezone}`,
    `每日容量：${settings.capacityMinutes} 分钟`,
    `工作窗口：${JSON.stringify(settings.windows)}`,
    `任务：${JSON.stringify(compactTasks)}`,
    '输出格式：{"summary":"不超过120字","items":[{"taskId":"任务ID","block":"morning|afternoon|evening","startMinute":540,"endMinute":570,"reason":"不超过80字"}]}',
    "只可使用给定任务 ID；不能重叠、不能超出工作窗口或每日容量；可以少安排任务。",
  ].join("\n");
  const text = await requestAi(prompt, userId);
  return validateDraftItems(parseJson(text), tasks, settings);
}
