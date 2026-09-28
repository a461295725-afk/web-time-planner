import { randomUUID } from "node:crypto";
import { sqlite } from "@/db";
import { shiftDate } from "@/lib/date";
import type { TaskItem } from "@/lib/mock-data";
import { broadcastChange } from "@/lib/sse-manager";
import { createTask, getProject, getProjects, getTasks } from "@/lib/server-store";
import { isDateKey, isPriority } from "@/lib/validation";

export interface WorkflowStep {
  key: string;
  title: string;
  level: "milestone" | "task" | "action";
  parentKey?: string;
  description?: string;
  estimatedMinutes?: number;
  priority?: TaskItem["priority"];
  scheduleOffsetDays?: number;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  source: string;
  createdAt: number;
  updatedAt: number;
}

type WorkflowRow = {
  id: string;
  name: string;
  description: string;
  steps_json: string;
  source: string;
  created_at: number;
  updated_at: number;
};

function invalid(message: string): never {
  throw new Error(message);
}

function cleanText(value: unknown, field: string, maxLength: number): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") invalid(`${field}无效`);
  const result = value.trim();
  if (result.length > maxLength) invalid(`${field}过长`);
  return result;
}

function normaliseSteps(value: unknown): WorkflowStep[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) {
    invalid("流程步骤必须是 1 到 50 项");
  }
  const keys = new Set<string>();
  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) invalid("流程步骤无效");
    const item = raw as Record<string, unknown>;
    const key = cleanText(item.key, "步骤 key", 80);
    const title = cleanText(item.title, "步骤标题", 200);
    if (!key || !/^[A-Za-z0-9_-]+$/.test(key) || keys.has(key)) invalid("步骤 key 无效或重复");
    if (!title) invalid("步骤标题不能为空");
    const level = item.level ?? "action";
    if (level !== "milestone" && level !== "task" && level !== "action") {
      invalid("步骤层级无效");
    }
    const parentKey = cleanText(item.parentKey, "上级步骤", 80) || undefined;
    if (parentKey && !keys.has(parentKey)) invalid(`第 ${index + 1} 步的上级步骤必须排在它前面`);
    const estimatedMinutes = item.estimatedMinutes;
    if (
      estimatedMinutes !== undefined &&
      (!Number.isInteger(estimatedMinutes) || (estimatedMinutes as number) < 5 || (estimatedMinutes as number) > 1440)
    ) {
      invalid("步骤预计时长无效");
    }
    const priority = item.priority;
    if (priority !== undefined && !isPriority(priority)) invalid("步骤优先级无效");
    const scheduleOffsetDays = item.scheduleOffsetDays;
    if (
      scheduleOffsetDays !== undefined &&
      (!Number.isInteger(scheduleOffsetDays) || (scheduleOffsetDays as number) < 0 || (scheduleOffsetDays as number) > 365)
    ) {
      invalid("步骤日期偏移无效");
    }
    keys.add(key);
    return {
      key,
      title,
      level,
      parentKey,
      description: cleanText(item.description, "步骤说明", 2_000) || undefined,
      estimatedMinutes: estimatedMinutes as number | undefined,
      priority: priority as TaskItem["priority"] | undefined,
      scheduleOffsetDays: scheduleOffsetDays as number | undefined,
    };
  });
}

function mapTemplate(row: WorkflowRow): WorkflowTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    steps: normaliseSteps(JSON.parse(row.steps_json) as unknown),
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function workflowRow(userId: string, id: string): WorkflowRow | undefined {
  return sqlite
    .prepare(
      `SELECT id, name, description, steps_json, source, created_at, updated_at
       FROM workflow_templates WHERE id = ? AND user_id = ?`
    )
    .get(id, userId) as WorkflowRow | undefined;
}

export function listWorkflowTemplates(userId: string): WorkflowTemplate[] {
  const rows = sqlite
    .prepare(
      `SELECT id, name, description, steps_json, source, created_at, updated_at
       FROM workflow_templates WHERE user_id = ? ORDER BY updated_at DESC`
    )
    .all(userId) as WorkflowRow[];
  return rows.map(mapTemplate);
}

export function getWorkflowTemplate(userId: string, id: string): WorkflowTemplate | undefined {
  const row = workflowRow(userId, id);
  return row ? mapTemplate(row) : undefined;
}

export function saveWorkflowTemplate(
  userId: string,
  input: { name: unknown; description?: unknown; steps: unknown; source?: unknown }
): WorkflowTemplate {
  const name = cleanText(input.name, "流程名称", 120);
  if (!name) invalid("流程名称不能为空");
  const description = cleanText(input.description, "流程说明", 2_000);
  const steps = normaliseSteps(input.steps);
  const source = cleanText(input.source, "来源", 100) || "manual";
  const timestamp = Date.now();
  const existing = sqlite
    .prepare("SELECT id, created_at FROM workflow_templates WHERE user_id = ? AND name = ?")
    .get(userId, name) as { id: string; created_at: number } | undefined;
  const id = existing?.id ?? randomUUID();
  sqlite
    .prepare(
      `INSERT INTO workflow_templates
       (id, user_id, name, description, steps_json, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, name) DO UPDATE SET
         description = excluded.description,
         steps_json = excluded.steps_json,
         source = excluded.source,
         updated_at = excluded.updated_at`
    )
    .run(
      id,
      userId,
      name,
      description,
      JSON.stringify(steps),
      source,
      existing?.created_at ?? timestamp,
      timestamp
    );
  broadcastChange(userId);
  return getWorkflowTemplate(userId, id)!;
}

export function deleteWorkflowTemplate(userId: string, id: string): boolean {
  const result = sqlite
    .prepare("DELETE FROM workflow_templates WHERE id = ? AND user_id = ?")
    .run(id, userId);
  if (result.changes > 0) broadcastChange(userId);
  return result.changes > 0;
}

export function applyWorkflowTemplate(
  userId: string,
  id: string,
  input: { projectId?: unknown; scheduledDate?: unknown }
): { template: WorkflowTemplate; applicationId: string; tasks: TaskItem[] } {
  const template = getWorkflowTemplate(userId, id);
  if (!template) invalid("流程模板不存在");
  const projectId = cleanText(input.projectId, "项目 ID", 100) || undefined;
  if (projectId && !getProject(userId, projectId)) invalid("项目不存在");
  const scheduledDate = cleanText(input.scheduledDate, "安排日期", 10) || undefined;
  if (scheduledDate && !isDateKey(scheduledDate)) invalid("安排日期无效");

  const applicationId = randomUUID();
  const createdByKey = new Map<string, TaskItem>();
  const tasks = template.steps.map((step) => {
    const parent = step.parentKey ? createdByKey.get(step.parentKey) : undefined;
    const task = createTask(userId, {
      title: step.title,
      description: step.description,
      priority: step.priority,
      estimatedMinutes: step.estimatedMinutes,
      scheduledDate: scheduledDate
        ? shiftDate(scheduledDate, step.scheduleOffsetDays ?? 0)
        : undefined,
      projectId,
      taskLevel: step.level,
      parentTaskId: parent?.id,
      originSource: `workflow:${template.name}`,
      originRef: `${template.id}:${applicationId}:${step.key}`,
    });
    createdByKey.set(step.key, task);
    return task;
  });
  return { template, applicationId, tasks };
}

export function suggestWorkflowCandidates(userId: string) {
  const templates = new Set(listWorkflowTemplates(userId).map((item) => item.name));
  const tasks = getTasks(userId);
  return getProjects(userId)
    .map((project) => {
      const projectTasks = tasks.filter((task) => task.projectId === project.id);
      if (projectTasks.length < 3) return null;
      const name = `${project.name}流程`;
      if (templates.has(name)) return null;
      const selected = projectTasks.slice(0, 20);
      const selectedIds = new Set(selected.map((task) => task.id));
      return {
        candidateId: `project:${project.id}`,
        name,
        description: `根据项目“${project.name}”的现有任务生成，保存前请确认步骤。`,
        evidence: {
          projectId: project.id,
          taskCount: projectTasks.length,
        },
        steps: selected.map((task, index) => ({
          key: `step-${index + 1}`,
          title: task.title,
          level: task.taskLevel ?? "action",
          parentKey:
            task.parentTaskId && selectedIds.has(task.parentTaskId)
              ? `step-${selected.findIndex((item) => item.id === task.parentTaskId) + 1}`
              : undefined,
          description: task.description,
          estimatedMinutes: task.estimatedMinutes,
          priority: task.priority,
        })),
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
}

