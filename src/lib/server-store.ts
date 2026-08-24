import { randomUUID } from "crypto";
import { sqlite } from "@/db";
import { broadcastChange } from "@/lib/sse-manager";
import {
  generateHermesToken,
  hashHermesToken,
  hermesTokenLast4,
} from "@/lib/hermes-token";
import {
  isDateKey,
  isPriority,
  parseDateKey,
} from "@/lib/validation";
import {
  HabitItem,
  HabitLogItem,
  IdeaItem,
  ProjectItem,
  ProjectGroupItem,
  ReadingItem,
  TaskItem,
} from "@/lib/mock-data";
import {
  AiProvider,
  defaultSettings,
  PublicSettings,
  ThemeKey,
} from "@/lib/settings";
import { todayKey } from "@/lib/date";

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  priority: TaskItem["priority"];
  status: "todo" | "done" | "overdue";
  due_date: string | null;
  scheduled_date: string | null;
  project_id: string | null;
  show_in_week_plan: number;
  sort_order: number;
  today_sort_order: number;
  estimated_minutes: number | null;
  energy_level: TaskItem["energyLevel"] | null;
  preferred_period: TaskItem["preferredPeriod"] | null;
  completed_at: number | null;
};

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  due_date: string | null;
  show_in_week_plan: number;
  pinned: number;
  group_name: string | null;
  project_order: number;
};

type ProjectGroupRow = {
  id: string;
  name: string;
  sort_order: number;
};

type MutationResult<T> = { value: T; changed: boolean };

const now = () => Date.now();

function commitMutation<T>(userId: string, work: () => MutationResult<T>): T {
  const result = sqlite.transaction(work)();
  if (result.changed) broadcastChange(userId);
  return result.value;
}

function invalid(message: string): never {
  throw new Error(message);
}

function requiredDate(value: string, field: string): string {
  if (!isDateKey(value)) invalid(`${field} 日期无效`);
  return value;
}

function nullableDate(value: string | null | undefined, field: string): string | null {
  if (value === undefined || value === null) return null;
  return requiredDate(value, field);
}

function requiredPriority(
  value: TaskItem["priority"] | undefined,
  fallback: TaskItem["priority"]
): TaskItem["priority"] {
  const next = value ?? fallback;
  if (!isPriority(next)) invalid("优先级无效");
  return next;
}

function nullableEstimatedMinutes(value: number | null | undefined): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || value < 5 || value > 1440) {
    invalid("预计时长必须是 5 到 1440 分钟的整数");
  }
  return value;
}

function nullableEnergyLevel(
  value: TaskItem["energyLevel"] | null | undefined
): TaskItem["energyLevel"] | null {
  if (value === undefined || value === null) return null;
  if (!["low", "medium", "high"].includes(value)) invalid("精力等级无效");
  return value;
}

function nullablePreferredPeriod(
  value: TaskItem["preferredPeriod"] | null | undefined
): TaskItem["preferredPeriod"] | null {
  if (value === undefined || value === null) return null;
  if (!["morning", "afternoon", "evening", "anytime"].includes(value)) {
    invalid("偏好时段无效");
  }
  return value;
}

function settingsMap(userId: string): Map<string, string> {
  const rows = sqlite
    .prepare("SELECT key, value FROM app_settings WHERE user_id = ?")
    .all(userId) as { key: string; value: string }[];
  return new Map(rows.map((row) => [row.key, row.value]));
}

function booleanValue(value: string | undefined, fallback: boolean): boolean {
  return value === undefined ? fallback : value === "true";
}

function hermesMetadata(userId: string): {
  hermesTokenLast4: string | null;
  hermesTokenCreatedAt: number | null;
  hermesTokenRotatedAt: number | null;
  hermesTokenRevokedAt: number | null;
  hermesTokenAvailable: boolean;
} {
  const row = sqlite
    .prepare(
      `SELECT token_last4, created_at, rotated_at, revoked_at
       FROM hermes_api_tokens
       WHERE user_id = ?
       ORDER BY CASE WHEN revoked_at IS NULL THEN 0 ELSE 1 END, created_at DESC
       LIMIT 1`
    )
    .get(userId) as
    | {
        token_last4: string;
        created_at: number;
        rotated_at: number | null;
        revoked_at: number | null;
      }
    | undefined;
  return {
    hermesTokenLast4: row?.token_last4 ?? null,
    hermesTokenCreatedAt: row?.created_at ?? null,
    hermesTokenRotatedAt: row?.rotated_at ?? null,
    hermesTokenRevokedAt: row?.revoked_at ?? null,
    hermesTokenAvailable: Boolean(row && row.revoked_at === null),
  };
}

export function getSettings(userId: string): PublicSettings {
  const stored = settingsMap(userId);
  const theme = stored.get("theme") as ThemeKey | undefined;
  const aiProvider = stored.get("aiProvider") as AiProvider | undefined;
  const defaultPriority = stored.get("defaultPriority") as
    | TaskItem["priority"]
    | undefined;
  return {
    theme: ["neon", "ocean", "amber", "rose"].includes(theme ?? "")
      ? theme!
      : defaultSettings.theme,
    aiProvider: ["openai", "anthropic", "compatible"].includes(aiProvider ?? "")
      ? aiProvider!
      : defaultSettings.aiProvider,
    aiModel: stored.get("aiModel") ?? defaultSettings.aiModel,
    aiBaseUrl: stored.get("aiBaseUrl") ?? defaultSettings.aiBaseUrl,
    defaultPriority: ["P1", "P2", "P3"].includes(defaultPriority ?? "")
      ? defaultPriority!
      : defaultSettings.defaultPriority,
    autoAddProjectTaskToWeek: booleanValue(
      stored.get("autoAddProjectTaskToWeek"),
      defaultSettings.autoAddProjectTaskToWeek
    ),
    autoScheduleConvertedIdea: booleanValue(
      stored.get("autoScheduleConvertedIdea"),
      defaultSettings.autoScheduleConvertedIdea
    ),
    aiKeyConfigured: Boolean(process.env.AI_API_KEY),
    ...hermesMetadata(userId),
  };
}

type StoredSettingKey =
  | "theme"
  | "aiProvider"
  | "aiModel"
  | "aiBaseUrl"
  | "defaultPriority"
  | "autoAddProjectTaskToWeek"
  | "autoScheduleConvertedIdea";

function writeSettings(
  userId: string,
  input: Partial<Omit<PublicSettings, "aiKeyConfigured">>
): void {
  const current = getSettings(userId);
  const theme = input.theme ?? current.theme;
  const provider = input.aiProvider ?? current.aiProvider;
  const priority = input.defaultPriority ?? current.defaultPriority;
  if (!["neon", "ocean", "amber", "rose"].includes(theme)) invalid("主题无效");
  if (!["openai", "anthropic", "compatible"].includes(provider)) invalid("AI 服务商无效");
  if (!isPriority(priority)) invalid("默认优先级无效");
  const allowed: Record<StoredSettingKey, string | boolean> = {
    theme,
    aiProvider: provider,
    aiModel: input.aiModel?.trim() || current.aiModel,
    aiBaseUrl: input.aiBaseUrl?.trim() || current.aiBaseUrl,
    defaultPriority: priority,
    autoAddProjectTaskToWeek:
      input.autoAddProjectTaskToWeek ?? current.autoAddProjectTaskToWeek,
    autoScheduleConvertedIdea:
      input.autoScheduleConvertedIdea ?? current.autoScheduleConvertedIdea,
  };
  const statement = sqlite.prepare(
    `INSERT INTO app_settings (id, user_id, key, value, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  );
  const timestamp = now();
  for (const [key, value] of Object.entries(allowed) as [StoredSettingKey, string | boolean][]) {
    statement.run(randomUUID(), userId, key, String(value), timestamp);
  }
}

export function updateSettings(
  userId: string,
  input: Partial<Omit<PublicSettings, "aiKeyConfigured">>
): PublicSettings {
  return commitMutation(userId, () => {
    writeSettings(userId, input);
    return { value: getSettings(userId), changed: true };
  });
}

export interface IssuedHermesToken {
  token: string;
  last4: string;
  createdAt: number;
  rotatedAt: number | null;
  revokedAt: null;
}

export function resetHermesToken(userId: string): IssuedHermesToken {
  return commitMutation(userId, () => {
    const token = generateHermesToken();
    const timestamp = now();
    sqlite
      .prepare(
        "UPDATE hermes_api_tokens SET revoked_at = ?, rotated_at = ? WHERE user_id = ? AND revoked_at IS NULL"
      )
      .run(timestamp, timestamp, userId);
    sqlite
      .prepare(
        `INSERT INTO hermes_api_tokens
         (id, user_id, token_hash, token_last4, created_at, rotated_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, NULL, NULL)`
      )
      .run(randomUUID(), userId, hashHermesToken(token), hermesTokenLast4(token), timestamp);
    return {
      value: { token, last4: hermesTokenLast4(token), createdAt: timestamp, rotatedAt: null, revokedAt: null },
      changed: true,
    };
  });
}

export function revokeHermesToken(userId: string): boolean {
  return commitMutation(userId, () => {
    const timestamp = now();
    const result = sqlite
      .prepare(
        "UPDATE hermes_api_tokens SET revoked_at = ?, rotated_at = ? WHERE user_id = ? AND revoked_at IS NULL"
      )
      .run(timestamp, timestamp, userId);
    return { value: result.changes > 0, changed: result.changes > 0 };
  });
}

export function getUserByApiToken(
  token: string,
  database = sqlite
): { userId: string; username: string } | null {
  if (!token || token.length < 20) return null;
  const row = database
    .prepare(
      `SELECT u.id AS user_id, u.username
       FROM hermes_api_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = ? AND t.revoked_at IS NULL`
    )
    .get(hashHermesToken(token)) as { user_id: string; username: string } | undefined;
  return row ? { userId: row.user_id, username: row.username } : null;
}

function mapTask(row: TaskRow): TaskItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    priority: row.priority,
    done: row.status === "done",
    dueDate: row.scheduled_date ?? "",
    scheduledDate: row.scheduled_date ?? undefined,
    projectId: row.project_id ?? undefined,
    showInWeekPlan: Boolean(row.show_in_week_plan),
    sortOrder: row.sort_order,
    todaySortOrder: row.today_sort_order,
    estimatedMinutes: row.estimated_minutes ?? undefined,
    energyLevel: row.energy_level ?? undefined,
    preferredPeriod: row.preferred_period ?? undefined,
    completedAt: row.completed_at ?? undefined,
  };
}

function mapProject(row: ProjectRow): ProjectItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    dueDate: row.due_date ?? "",
    showInWeekPlan: Boolean(row.show_in_week_plan),
    pinned: Boolean(row.pinned),
    groupName: row.group_name ?? undefined,
    projectOrder: row.project_order,
  };
}

function taskRow(userId: string, id: string): TaskRow | undefined {
  return sqlite
    .prepare(
      `SELECT id, title, description, priority, status, due_date, scheduled_date,
        project_id, show_in_week_plan, sort_order, today_sort_order,
        estimated_minutes, energy_level, preferred_period, completed_at
       FROM tasks WHERE id = ? AND user_id = ?`
    )
    .get(id, userId) as TaskRow | undefined;
}

export function getTasks(userId: string): TaskItem[] {
  const rows = sqlite
    .prepare(
      `SELECT id, title, description, priority, status, due_date, scheduled_date,
        project_id, show_in_week_plan, sort_order, today_sort_order,
        estimated_minutes, energy_level, preferred_period, completed_at
       FROM tasks WHERE user_id = ?
       ORDER BY sort_order ASC, created_at ASC`
    )
    .all(userId) as TaskRow[];
  return rows.map(mapTask);
}

function createTaskInTransaction(
  userId: string,
  input: {
    title: string;
    description?: string;
    priority?: TaskItem["priority"];
    dueDate?: string | null;
    scheduledDate?: string | null;
    projectId?: string | null;
    showInWeekPlan?: boolean;
    estimatedMinutes?: number | null;
    energyLevel?: TaskItem["energyLevel"] | null;
    preferredPeriod?: TaskItem["preferredPeriod"] | null;
  }
): TaskItem {
  const settings = getSettings(userId);
  const title = input.title.trim();
  if (!title) invalid("任务标题不能为空");
  const scheduledDate =
    input.scheduledDate !== undefined
      ? nullableDate(input.scheduledDate, "scheduledDate")
      : nullableDate(input.dueDate, "dueDate");
  const showInWeekPlan =
    input.showInWeekPlan ??
    Boolean(input.projectId && settings.autoAddProjectTaskToWeek);
  if (input.projectId) {
    const project = sqlite
      .prepare("SELECT id FROM projects WHERE id = ? AND user_id = ?")
      .get(input.projectId, userId);
    if (!project) invalid("项目不属于当前用户");
  }
  const id = randomUUID();
  const timestamp = now();
  const estimatedMinutes = nullableEstimatedMinutes(input.estimatedMinutes);
  const energyLevel = nullableEnergyLevel(input.energyLevel);
  const preferredPeriod = nullablePreferredPeriod(input.preferredPeriod);
  const groupWhere = input.projectId
    ? "project_id = ? AND user_id = ?"
    : showInWeekPlan
      ? "show_in_week_plan = 1 AND project_id IS NULL AND user_id = ?"
      : "scheduled_date = ? AND project_id IS NULL AND user_id = ?";
  const groupValues = input.projectId
    ? [input.projectId, userId]
    : showInWeekPlan
      ? [userId]
      : [scheduledDate ?? "", userId];
  const max = sqlite
    .prepare(`SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM tasks WHERE ${groupWhere}`)
    .get(...groupValues) as { max_order: number };
  const todaySortOrder = scheduledDate
    ? (
        sqlite
          .prepare(
            "SELECT COALESCE(MAX(today_sort_order), -1) AS max_order FROM tasks WHERE scheduled_date = ? AND user_id = ?"
          )
          .get(scheduledDate, userId) as { max_order: number }
      ).max_order + 1
    : 0;
  sqlite
    .prepare(
      `INSERT INTO tasks
       (id, user_id, title, description, priority, status, due_date, scheduled_date, project_id,
        show_in_week_plan, sort_order, today_sort_order, estimated_minutes, energy_level,
        preferred_period, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
    )
    .run(
      id,
      userId,
      title,
      input.description?.trim() ?? "",
      requiredPriority(input.priority, settings.defaultPriority),
      scheduledDate,
      scheduledDate,
      input.projectId ?? null,
      showInWeekPlan ? 1 : 0,
      max.max_order + 1,
      todaySortOrder,
      estimatedMinutes,
      energyLevel,
      preferredPeriod,
      timestamp,
      timestamp
    );
  return getTask(userId, id)!;
}

export function createTask(
  userId: string,
  input: {
    title: string;
    description?: string;
    priority?: TaskItem["priority"];
    dueDate?: string | null;
    scheduledDate?: string | null;
    projectId?: string | null;
    showInWeekPlan?: boolean;
    estimatedMinutes?: number | null;
    energyLevel?: TaskItem["energyLevel"] | null;
    preferredPeriod?: TaskItem["preferredPeriod"] | null;
  }
): TaskItem {
  return commitMutation(userId, () => ({ value: createTaskInTransaction(userId, input), changed: true }));
}

export function getTask(userId: string, id: string): TaskItem | undefined {
  const row = taskRow(userId, id);
  return row ? mapTask(row) : undefined;
}

export function updateTask(
  userId: string,
  id: string,
  input: Partial<{
    title: string;
    description: string;
    priority: TaskItem["priority"];
    done: boolean;
    dueDate: string | null;
    scheduledDate: string | null;
    showInWeekPlan: boolean;
    estimatedMinutes: number | null;
    energyLevel: TaskItem["energyLevel"] | null;
    preferredPeriod: TaskItem["preferredPeriod"] | null;
  }>
): TaskItem | undefined {
  const currentRow = taskRow(userId, id);
  if (!currentRow) return undefined;
  const current = mapTask(currentRow);
  const hasScheduled =
    Object.prototype.hasOwnProperty.call(input, "scheduledDate") &&
    input.scheduledDate !== undefined;
  const hasDue =
    Object.prototype.hasOwnProperty.call(input, "dueDate") &&
    input.dueDate !== undefined;
  const scheduledDate = hasScheduled
    ? nullableDate(input.scheduledDate, "scheduledDate")
    : hasDue
      ? nullableDate(input.dueDate, "dueDate")
      : current.scheduledDate ?? null;
  const priority = requiredPriority(input.priority, current.priority);
  const showInWeekPlan = input.showInWeekPlan ?? Boolean(current.showInWeekPlan);
  const estimatedMinutes = Object.prototype.hasOwnProperty.call(input, "estimatedMinutes")
    ? nullableEstimatedMinutes(input.estimatedMinutes)
    : current.estimatedMinutes ?? null;
  const energyLevel = Object.prototype.hasOwnProperty.call(input, "energyLevel")
    ? nullableEnergyLevel(input.energyLevel)
    : current.energyLevel ?? null;
  const preferredPeriod = Object.prototype.hasOwnProperty.call(input, "preferredPeriod")
    ? nullablePreferredPeriod(input.preferredPeriod)
    : current.preferredPeriod ?? null;
  const nextDone = input.done ?? current.done;
  const completedAt =
    input.done === undefined
      ? current.completedAt ?? null
      : input.done
        ? current.completedAt ?? now()
        : null;
  return commitMutation(userId, () => {
    const timestamp = now();
    let todaySortOrder = current.todaySortOrder ?? 0;
    if (scheduledDate && scheduledDate !== current.scheduledDate) {
      const max = sqlite
        .prepare(
          "SELECT COALESCE(MAX(today_sort_order), -1) AS max_order FROM tasks WHERE scheduled_date = ? AND user_id = ?"
        )
        .get(scheduledDate, userId) as { max_order: number };
      todaySortOrder = max.max_order + 1;
    }
    let sortOrder = current.sortOrder ?? 0;
    if (showInWeekPlan && !current.showInWeekPlan) {
      const max = sqlite
        .prepare(
          "SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM tasks WHERE show_in_week_plan = 1 AND user_id = ?"
        )
        .get(userId) as { max_order: number };
      sortOrder = max.max_order + 1;
    }
    sqlite
      .prepare(
        `UPDATE tasks SET title = ?, description = ?, priority = ?, status = ?,
         due_date = ?, scheduled_date = ?, show_in_week_plan = ?, sort_order = ?,
         today_sort_order = ?, estimated_minutes = ?, energy_level = ?, preferred_period = ?,
         completed_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`
      )
      .run(
        input.title?.trim() || current.title,
        input.description ?? current.description ?? "",
        priority,
        nextDone ? "done" : "todo",
        scheduledDate,
        scheduledDate,
        showInWeekPlan ? 1 : 0,
        sortOrder,
        todaySortOrder,
        estimatedMinutes,
        energyLevel,
        preferredPeriod,
        completedAt,
        timestamp,
        id,
        userId
      );
    if (input.done !== undefined && input.done !== current.done) {
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
          input.done ? "completed" : "reopened",
          JSON.stringify({ scheduledDate }),
          timestamp
        );
    }
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
          JSON.stringify({ from: current.scheduledDate ?? null, to: scheduledDate }),
          timestamp
        );
    }
    return { value: getTask(userId, id), changed: true };
  });
}

export function deleteTask(userId: string, id: string): boolean {
  return commitMutation(userId, () => {
    const result = sqlite.prepare("DELETE FROM tasks WHERE id = ? AND user_id = ?").run(id, userId);
    return { value: result.changes > 0, changed: result.changes > 0 };
  });
}

export function reorderTasks(
  userId: string,
  ids: string[],
  scope: "default" | "today" | "scheduled" = "default"
): boolean {
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) return false;
  return commitMutation(userId, () => {
    if (ids.length === 0) return { value: false, changed: false };
    const placeholders = ids.map(() => "?").join(",");
    const owned = sqlite
      .prepare(`SELECT id FROM tasks WHERE user_id = ? AND id IN (${placeholders})`)
      .all(userId, ...ids) as { id: string }[];
    if (owned.length !== ids.length) return { value: false, changed: false };
    const column = scope === "default" ? "sort_order" : "today_sort_order";
    const update = sqlite.prepare(
      `UPDATE tasks SET ${column} = ?, updated_at = ? WHERE id = ? AND user_id = ?`
    );
    const timestamp = now();
    ids.forEach((taskId, index) => update.run(index, timestamp, taskId, userId));
    return { value: true, changed: true };
  });
}

export function getHabits(userId: string, date: string): {
  habits: HabitItem[];
  habitLogs: HabitLogItem[];
} {
  requiredDate(date, "打卡");
  const rows = sqlite
    .prepare("SELECT id, name, icon FROM habits WHERE user_id = ? ORDER BY created_at ASC")
    .all(userId) as { id: string; name: string; icon: string }[];
  const logs = sqlite
    .prepare("SELECT habit_id, date FROM habit_logs WHERE user_id = ? ORDER BY date ASC")
    .all(userId) as { habit_id: string; date: string }[];
  return {
    habits: rows.map((habit) => ({
      ...habit,
      checked: logs.some((log) => log.habit_id === habit.id && log.date === date),
    })),
    habitLogs: logs.map((log) => ({ habitId: log.habit_id, date: log.date })),
  };
}

export function toggleHabit(userId: string, habitId: string, date: string): boolean {
  requiredDate(date, "打卡");
  return commitMutation(userId, () => {
    const habit = sqlite
      .prepare("SELECT id FROM habits WHERE id = ? AND user_id = ?")
      .get(habitId, userId);
    if (!habit) return { value: false, changed: false };
    const found = sqlite
      .prepare("SELECT id FROM habit_logs WHERE habit_id = ? AND date = ? AND user_id = ?")
      .get(habitId, date, userId) as { id: string } | undefined;
    if (found) {
      sqlite.prepare("DELETE FROM habit_logs WHERE id = ? AND user_id = ?").run(found.id, userId);
      return { value: false, changed: true };
    }
    sqlite
      .prepare(
        "INSERT INTO habit_logs (id, user_id, habit_id, date, created_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(randomUUID(), userId, habitId, date, now());
    return { value: true, changed: true };
  });
}

export function createHabit(userId: string, input: { name: string; icon?: string }): HabitItem {
  const name = input.name.trim();
  if (!name) invalid("打卡项目名称不能为空");
  return commitMutation(userId, () => {
    const item = { id: randomUUID(), name, icon: input.icon ?? "clipboard-check", checked: false };
    sqlite
      .prepare("INSERT INTO habits (id, user_id, name, icon, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(item.id, userId, item.name, item.icon, now());
    return { value: item, changed: true };
  });
}

export function updateHabit(
  userId: string,
  id: string,
  input: { name?: string; icon?: string },
  date: string
): HabitItem | undefined {
  requiredDate(date, "打卡");
  const current = sqlite
    .prepare("SELECT id, name, icon FROM habits WHERE id = ? AND user_id = ?")
    .get(id, userId) as { id: string; name: string; icon: string } | undefined;
  if (!current) return undefined;
  return commitMutation(userId, () => {
    const name = input.name?.trim() || current.name;
    const icon = input.icon ?? current.icon;
    sqlite.prepare("UPDATE habits SET name = ?, icon = ? WHERE id = ? AND user_id = ?").run(name, icon, id, userId);
    const checked = Boolean(
      sqlite
        .prepare("SELECT id FROM habit_logs WHERE habit_id = ? AND date = ? AND user_id = ?")
        .get(id, date, userId)
    );
    return { value: { id, name, icon, checked }, changed: true };
  });
}

export function deleteHabit(userId: string, id: string): boolean {
  return commitMutation(userId, () => {
    const found = sqlite.prepare("SELECT id FROM habits WHERE id = ? AND user_id = ?").get(id, userId);
    if (!found) return { value: false, changed: false };
    sqlite.prepare("DELETE FROM habit_logs WHERE habit_id = ? AND user_id = ?").run(id, userId);
    sqlite.prepare("DELETE FROM habits WHERE id = ? AND user_id = ?").run(id, userId);
    return { value: true, changed: true };
  });
}

export function getProjects(userId: string): ProjectItem[] {
  const rows = sqlite
    .prepare(
      `SELECT id, name, description, due_date, show_in_week_plan, pinned, group_name, project_order
       FROM projects WHERE user_id = ?
       ORDER BY pinned DESC, project_order ASC, created_at ASC`
    )
    .all(userId) as ProjectRow[];
  return rows.map(mapProject);
}

export function getProjectGroups(userId: string): ProjectGroupItem[] {
  const saved = sqlite
    .prepare(
      "SELECT id, name, sort_order FROM project_groups WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC"
    )
    .all(userId) as ProjectGroupRow[];
  const savedNames = new Set(saved.map((group) => group.name));
  const projectOnlyGroups = sqlite
    .prepare(
      `SELECT DISTINCT group_name AS name FROM projects
       WHERE user_id = ? AND group_name IS NOT NULL AND trim(group_name) <> ''
       ORDER BY group_name ASC`
    )
    .all(userId) as { name: string }[];
  return [
    ...saved.map((group) => ({ id: group.id, name: group.name, sortOrder: group.sort_order })),
    ...projectOnlyGroups
      .filter((group) => !savedNames.has(group.name))
      .map((group, index) => ({ id: `project-group:${group.name}`, name: group.name, sortOrder: saved.length + index })),
  ];
}

function createProjectGroupInTransaction(userId: string, name: string): ProjectGroupItem | undefined {
  const cleanName = name.trim();
  if (!cleanName) return undefined;
  const existing = sqlite
    .prepare("SELECT id, name, sort_order FROM project_groups WHERE user_id = ? AND name = ?")
    .get(userId, cleanName) as ProjectGroupRow | undefined;
  if (existing) return { id: existing.id, name: existing.name, sortOrder: existing.sort_order };
  const max = sqlite
    .prepare("SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM project_groups WHERE user_id = ?")
    .get(userId) as { max_order: number };
  const timestamp = now();
  const item = { id: randomUUID(), name: cleanName, sortOrder: max.max_order + 1 };
  sqlite
    .prepare(
      "INSERT INTO project_groups (id, user_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(item.id, userId, item.name, item.sortOrder, timestamp, timestamp);
  return item;
}

export function createProjectGroup(userId: string, name: string): ProjectGroupItem | undefined {
  return commitMutation(userId, () => {
    const before = sqlite
      .prepare("SELECT id FROM project_groups WHERE user_id = ? AND name = ?")
      .get(userId, name.trim());
    const value = createProjectGroupInTransaction(userId, name);
    return { value, changed: !before && Boolean(value) };
  });
}

function createProjectInTransaction(
  userId: string,
  input: { name: string; description?: string; dueDate?: string | null; groupName?: string | null }
): ProjectItem {
  const name = input.name.trim();
  if (!name) invalid("项目名称不能为空");
  const dueDate = nullableDate(input.dueDate, "项目");
  const groupName = input.groupName?.trim() || null;
  if (groupName) createProjectGroupInTransaction(userId, groupName);
  const max = sqlite
    .prepare("SELECT COALESCE(MAX(project_order), -1) AS max_order FROM projects WHERE user_id = ?")
    .get(userId) as { max_order: number };
  const id = randomUUID();
  const timestamp = now();
  sqlite
    .prepare(
      `INSERT INTO projects
       (id, user_id, name, description, due_date, show_in_week_plan, pinned, group_name, project_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`
    )
    .run(id, userId, name, input.description?.trim() ?? "", dueDate, groupName, max.max_order + 1, timestamp, timestamp);
  return getProject(userId, id)!;
}

export function createProject(
  userId: string,
  input: { name: string; description?: string; dueDate?: string | null; groupName?: string | null }
): ProjectItem {
  return commitMutation(userId, () => ({ value: createProjectInTransaction(userId, input), changed: true }));
}

export function getProject(userId: string, id: string): ProjectItem | undefined {
  const row = sqlite
    .prepare(
      "SELECT id, name, description, due_date, show_in_week_plan, pinned, group_name, project_order FROM projects WHERE id = ? AND user_id = ?"
    )
    .get(id, userId) as ProjectRow | undefined;
  return row ? mapProject(row) : undefined;
}

export function updateProject(
  userId: string,
  id: string,
  input: Partial<{
    name: string;
    description: string;
    dueDate: string | null;
    showInWeekPlan: boolean;
    pinned: boolean;
    groupName: string | null;
    projectOrder: number;
  }>
): ProjectItem | undefined {
  const project = getProject(userId, id);
  if (!project) return undefined;
  const dueDate = Object.prototype.hasOwnProperty.call(input, "dueDate")
    ? nullableDate(input.dueDate, "项目")
    : nullableDate(project.dueDate, "项目");
  const groupName = input.groupName !== undefined ? input.groupName?.trim() || null : project.groupName ?? null;
  return commitMutation(userId, () => {
    if (groupName) createProjectGroupInTransaction(userId, groupName);
    sqlite
      .prepare(
        "UPDATE projects SET name = ?, description = ?, due_date = ?, show_in_week_plan = ?, pinned = ?, group_name = ?, project_order = ?, updated_at = ? WHERE id = ? AND user_id = ?"
      )
      .run(
        input.name?.trim() || project.name,
        input.description ?? project.description ?? "",
        dueDate,
        (input.showInWeekPlan ?? project.showInWeekPlan) ? 1 : 0,
        (input.pinned ?? project.pinned) ? 1 : 0,
        groupName,
        input.projectOrder ?? project.projectOrder ?? 0,
        now(),
        id,
        userId
      );
    return { value: getProject(userId, id), changed: true };
  });
}

export function renameProjectGroup(userId: string, oldName: string, newName: string): ProjectGroupItem[] {
  const cleanOldName = oldName.trim();
  const cleanNewName = newName.trim();
  if (!cleanOldName || !cleanNewName || cleanOldName === cleanNewName) return getProjectGroups(userId);
  return commitMutation(userId, () => {
    const timestamp = now();
    createProjectGroupInTransaction(userId, cleanNewName);
    sqlite.prepare("DELETE FROM project_groups WHERE user_id = ? AND name = ?").run(userId, cleanOldName);
    sqlite
      .prepare("UPDATE projects SET group_name = ?, updated_at = ? WHERE user_id = ? AND group_name = ?")
      .run(cleanNewName, timestamp, userId, cleanOldName);
    return { value: getProjectGroups(userId), changed: true };
  });
}

export function reorderProjects(userId: string, input: { ids: string[]; groupName?: string | null }): ProjectItem[] {
  const uniqueIds = new Set(input.ids);
  if (uniqueIds.size !== input.ids.length) invalid("项目顺序无效");
  return commitMutation(userId, () => {
    if (input.ids.length === 0) return { value: getProjects(userId), changed: false };
    const placeholders = input.ids.map(() => "?").join(",");
    const owned = sqlite
      .prepare(`SELECT id FROM projects WHERE user_id = ? AND id IN (${placeholders})`)
      .all(userId, ...input.ids) as { id: string }[];
    if (owned.length !== input.ids.length) invalid("项目不属于当前用户");
    const groupName = input.groupName?.trim() || null;
    if (groupName) createProjectGroupInTransaction(userId, groupName);
    const timestamp = now();
    const update = sqlite.prepare(
      "UPDATE projects SET group_name = ?, project_order = ?, updated_at = ? WHERE id = ? AND user_id = ?"
    );
    input.ids.forEach((projectId, index) => update.run(groupName, index, timestamp, projectId, userId));
    return { value: getProjects(userId), changed: true };
  });
}

export function deleteProject(userId: string, id: string): boolean {
  return commitMutation(userId, () => {
    const project = sqlite.prepare("SELECT id FROM projects WHERE id = ? AND user_id = ?").get(id, userId);
    if (!project) return { value: false, changed: false };
    sqlite.prepare("DELETE FROM tasks WHERE project_id = ? AND user_id = ?").run(id, userId);
    sqlite.prepare("DELETE FROM projects WHERE id = ? AND user_id = ?").run(id, userId);
    return { value: true, changed: true };
  });
}

export function projectDetails(userId: string, id: string) {
  const project = getProject(userId, id);
  if (!project) return undefined;
  return { project, tasks: getTasks(userId).filter((task) => task.projectId === id) };
}

export function getIdeas(userId: string): IdeaItem[] {
  return sqlite
    .prepare(
      "SELECT id, title, content, created_at AS createdAt, updated_at AS updatedAt FROM ideas WHERE user_id = ? ORDER BY updated_at DESC"
    )
    .all(userId) as IdeaItem[];
}

export function createIdea(userId: string): IdeaItem {
  return commitMutation(userId, () => {
    const id = randomUUID();
    const timestamp = now();
    sqlite
      .prepare("INSERT INTO ideas (id, user_id, title, content, created_at, updated_at) VALUES (?, ?, '', '', ?, ?)")
      .run(id, userId, timestamp, timestamp);
    return { value: getIdea(userId, id)!, changed: true };
  });
}

export function getIdea(userId: string, id: string): IdeaItem | undefined {
  return sqlite
    .prepare(
      "SELECT id, title, content, created_at AS createdAt, updated_at AS updatedAt FROM ideas WHERE id = ? AND user_id = ?"
    )
    .get(id, userId) as IdeaItem | undefined;
}

export function updateIdea(userId: string, id: string, input: { title?: string; content?: string }): IdeaItem | undefined {
  const idea = getIdea(userId, id);
  if (!idea) return undefined;
  return commitMutation(userId, () => {
    sqlite
      .prepare("UPDATE ideas SET title = ?, content = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .run(input.title ?? idea.title, input.content ?? idea.content, now(), id, userId);
    return { value: getIdea(userId, id), changed: true };
  });
}

export function deleteIdea(userId: string, id: string): boolean {
  return commitMutation(userId, () => {
    const result = sqlite.prepare("DELETE FROM ideas WHERE id = ? AND user_id = ?").run(id, userId);
    return { value: result.changes > 0, changed: result.changes > 0 };
  });
}

export function convertIdea(
  userId: string,
  id: string,
  kind: "task" | "project",
  date: string
): TaskItem | ProjectItem | undefined {
  const idea = getIdea(userId, id);
  if (!idea || !idea.title.trim()) return undefined;
  const targetDate = requiredDate(date, "转换");
  return commitMutation(userId, () => {
    const settings = getSettings(userId);
    const result =
      kind === "project"
        ? createProjectInTransaction(userId, { name: idea.title, description: idea.content })
        : createTaskInTransaction(userId, {
            title: idea.title,
            description: idea.content,
            scheduledDate: settings.autoScheduleConvertedIdea ? targetDate : null,
          });
    sqlite.prepare("DELETE FROM ideas WHERE id = ? AND user_id = ?").run(id, userId);
    return { value: result, changed: true };
  });
}

export function normalizeReadingUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") invalid("链接格式无效");
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || key.toLowerCase() === "spm") url.searchParams.delete(key);
  }
  return url.toString().replace(/\/$/, "");
}

export function getReadingItems(userId: string): ReadingItem[] {
  const rows = sqlite
    .prepare(
      `SELECT id, url, normalized_url AS normalizedUrl, title, notes,
       is_read AS isRead, source, created_at AS createdAt, updated_at AS updatedAt
       FROM reading_items WHERE user_id = ? ORDER BY is_read ASC, updated_at DESC`
    )
    .all(userId) as (Omit<ReadingItem, "isRead"> & { isRead: number })[];
  return rows.map((item) => ({ ...item, isRead: Boolean(item.isRead) }));
}

export function upsertReadingItem(
  userId: string,
  input: { url: string; title?: string; notes?: string }
): { item: ReadingItem; existed: boolean } {
  const normalizedUrl = normalizeReadingUrl(input.url);
  return commitMutation<{ item: ReadingItem; existed: boolean }>(userId, () => {
    const existing = sqlite
      .prepare("SELECT id FROM reading_items WHERE normalized_url = ? AND user_id = ?")
      .get(normalizedUrl, userId) as { id: string } | undefined;
    const timestamp = now();
    if (existing) {
      sqlite
        .prepare("UPDATE reading_items SET title = ?, notes = ?, updated_at = ? WHERE id = ? AND user_id = ?")
        .run(input.title?.trim() || normalizedUrl, input.notes ?? "", timestamp, existing.id, userId);
      return {
        value: { item: getReadingItems(userId).find((item) => item.id === existing.id)!, existed: true },
        changed: true,
      };
    }
    const id = randomUUID();
    sqlite
      .prepare(
        `INSERT INTO reading_items
         (id, user_id, url, normalized_url, title, notes, is_read, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 'manual', ?, ?)`
      )
      .run(id, userId, input.url.trim(), normalizedUrl, input.title?.trim() || normalizedUrl, input.notes ?? "", timestamp, timestamp);
    return { value: { item: getReadingItems(userId).find((item) => item.id === id)!, existed: false }, changed: true };
  });
}

export function toggleReadingItem(userId: string, id: string, isRead: boolean): ReadingItem | undefined {
  const current = sqlite.prepare("SELECT id FROM reading_items WHERE id = ? AND user_id = ?").get(id, userId);
  if (!current) return undefined;
  return commitMutation(userId, () => {
    sqlite
      .prepare("UPDATE reading_items SET is_read = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .run(isRead ? 1 : 0, now(), id, userId);
    return { value: getReadingItems(userId).find((item) => item.id === id), changed: true };
  });
}

export function deleteReadingItem(userId: string, id: string): boolean {
  return commitMutation(userId, () => {
    const result = sqlite.prepare("DELETE FROM reading_items WHERE id = ? AND user_id = ?").run(id, userId);
    return { value: result.changes > 0, changed: result.changes > 0 };
  });
}

export interface RecurringTask {
  id: string;
  title: string;
  dayOfMonth: number;
  priority: "P1" | "P2" | "P3";
}

export function getRecurringTasks(userId: string): RecurringTask[] {
  return sqlite
    .prepare(
      "SELECT id, title, day_of_month AS dayOfMonth, priority FROM recurring_tasks WHERE user_id = ? ORDER BY day_of_month ASC"
    )
    .all(userId) as RecurringTask[];
}

function validDay(day: number): boolean {
  return Number.isInteger(day) && day >= 1 && day <= 31;
}

export function createRecurringTask(
  userId: string,
  input: { title: string; dayOfMonth: number; priority?: TaskItem["priority"] }
): RecurringTask {
  if (!input.title.trim() || !validDay(input.dayOfMonth)) invalid("每月固定任务参数无效");
  return commitMutation(userId, () => {
    const id = randomUUID();
    sqlite
      .prepare("INSERT INTO recurring_tasks (id, user_id, title, day_of_month, priority, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, userId, input.title.trim(), input.dayOfMonth, requiredPriority(input.priority, "P2"), now());
    return { value: getRecurringTasks(userId).find((task) => task.id === id)!, changed: true };
  });
}

export function updateRecurringTask(
  userId: string,
  id: string,
  input: { title?: string; dayOfMonth?: number; priority?: TaskItem["priority"] }
): RecurringTask | undefined {
  const current = sqlite
    .prepare("SELECT id, title, day_of_month AS dayOfMonth, priority FROM recurring_tasks WHERE id = ? AND user_id = ?")
    .get(id, userId) as RecurringTask | undefined;
  if (!current) return undefined;
  const title = input.title?.trim() || current.title;
  const dayOfMonth = input.dayOfMonth ?? current.dayOfMonth;
  if (!validDay(dayOfMonth)) invalid("每月固定任务日期无效");
  const priority = requiredPriority(input.priority, current.priority);
  return commitMutation(userId, () => {
    sqlite
      .prepare("UPDATE recurring_tasks SET title = ?, day_of_month = ?, priority = ? WHERE id = ? AND user_id = ?")
      .run(title, dayOfMonth, priority, id, userId);
    return { value: getRecurringTasks(userId).find((task) => task.id === id), changed: true };
  });
}

export function deleteRecurringTask(userId: string, id: string): boolean {
  return commitMutation(userId, () => {
    const result = sqlite.prepare("DELETE FROM recurring_tasks WHERE id = ? AND user_id = ?").run(id, userId);
    return { value: result.changes > 0, changed: result.changes > 0 };
  });
}

export function rolloverTasks(userId: string, date: string): number {
  requiredDate(date, "滚转");
  return commitMutation(userId, () => {
    const p1 = sqlite
      .prepare(
        `UPDATE tasks SET scheduled_date = ?, due_date = ?, updated_at = ?
         WHERE user_id = ? AND status <> 'done' AND priority = 'P1'
           AND scheduled_date IS NOT NULL AND scheduled_date < ?`
      )
      .run(date, date, now(), userId, date);
    const lower = sqlite
      .prepare(
        `UPDATE tasks SET scheduled_date = NULL, due_date = NULL, show_in_week_plan = 1, updated_at = ?
         WHERE user_id = ? AND status <> 'done' AND priority IN ('P2', 'P3')
           AND scheduled_date IS NOT NULL AND scheduled_date < ?`
      )
      .run(now(), userId, date);
    const changed = p1.changes + lower.changes;
    return { value: changed, changed: changed > 0 };
  });
}

export function dashboardData(userId: string, date: string, rolloverDate = todayKey()) {
  requiredDate(date, "仪表盘");
  rolloverTasks(userId, rolloverDate);
  return {
    tasks: getTasks(userId),
    projects: getProjects(userId),
    settings: getSettings(userId),
    recurringTasks: getRecurringTasks(userId),
    ...getHabits(userId, date),
  };
}

export function weekPlanData(userId: string, startDate: string, endDate: string, rolloverDate = todayKey()) {
  requiredDate(startDate, "周计划");
  requiredDate(endDate, "周计划");
  rolloverTasks(userId, rolloverDate);
  const tasks = getTasks(userId);
  const projects = getProjects(userId);
  const weekProjectIds = new Set(projects.filter((project) => project.showInWeekPlan).map((project) => project.id));
  return {
    projects,
    backlogTasks: tasks.filter(
      (task) => task.showInWeekPlan && !task.projectId && !task.scheduledDate && !task.done
    ),
    projectPoolTasks: tasks.filter(
      (task) => Boolean(task.projectId) && (task.showInWeekPlan || weekProjectIds.has(task.projectId!)) && !task.scheduledDate && !task.done
    ),
    scheduledTasks: tasks.filter(
      (task) => Boolean(task.scheduledDate) && task.scheduledDate! >= startDate && task.scheduledDate! <= endDate
    ),
  };
}
