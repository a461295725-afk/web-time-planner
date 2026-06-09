import { randomUUID } from "crypto";
import { sqlite } from "@/db";
import { broadcastChange } from "@/lib/sse-manager";
import {
  HabitItem,
  HabitLogItem,
  IdeaItem,
  ProjectItem,
  ReadingItem,
  TaskItem,
} from "@/lib/mock-data";
import {
  AiProvider,
  defaultSettings,
  PublicSettings,
  ThemeKey,
} from "@/lib/settings";

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
};

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  due_date: string | null;
  show_in_week_plan: number;
  pinned: number;
  group_name: string | null;
};

const now = () => Date.now();

/* ---------- settings ---------- */

function settingsMap(userId: string): Map<string, string> {
  const rows = sqlite
    .prepare("SELECT key, value FROM app_settings WHERE user_id = ?")
    .all(userId) as { key: string; value: string }[];
  return new Map(rows.map((row) => [row.key, row.value]));
}

function booleanValue(value: string | undefined, fallback: boolean): boolean {
  return value === undefined ? fallback : value === "true";
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
    hermesApiToken: stored.get("hermesApiToken") ?? defaultSettings.hermesApiToken,
    aiKeyConfigured: Boolean(process.env.AI_API_KEY),
  };
}

type StoredSettingKey = keyof typeof defaultSettings;

export function updateSettings(
  userId: string,
  input: Partial<Omit<PublicSettings, "aiKeyConfigured">>
): PublicSettings {
  const current = getSettings(userId);
  const allowed: Omit<PublicSettings, "aiKeyConfigured"> = {
    theme: input.theme ?? current.theme,
    aiProvider: input.aiProvider ?? current.aiProvider,
    aiModel: input.aiModel?.trim() || current.aiModel,
    aiBaseUrl: input.aiBaseUrl?.trim() || current.aiBaseUrl,
    defaultPriority: input.defaultPriority ?? current.defaultPriority,
    autoAddProjectTaskToWeek:
      input.autoAddProjectTaskToWeek ?? current.autoAddProjectTaskToWeek,
    autoScheduleConvertedIdea:
      input.autoScheduleConvertedIdea ?? current.autoScheduleConvertedIdea,
    hermesApiToken: input.hermesApiToken ?? current.hermesApiToken,
  };
  const statement = sqlite.prepare(
    `INSERT INTO app_settings (id, user_id, key, value, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  );
  const timestamp = now();
  sqlite.transaction(() => {
    (Object.entries(allowed) as [StoredSettingKey, string | boolean][]).forEach(
      ([key, value]) =>
        statement.run(randomUUID(), userId, key, String(value), timestamp)
    );
  })();
  broadcastChange(userId);
  return getSettings(userId);
}

export function getUserByApiToken(
  token: string
): { userId: string; username: string } | null {
  const row = sqlite
    .prepare(
      `SELECT u.id as user_id, u.username
       FROM app_settings s
       JOIN users u ON u.id = s.user_id
       WHERE s.key = 'hermesApiToken' AND s.value = ?`
    )
    .get(token) as { user_id: string; username: string } | undefined;
  if (!row) return null;
  return { userId: row.user_id, username: row.username };
}

/* ---------- helpers ---------- */

function mapTask(row: TaskRow): TaskItem {
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
    sortOrder: row.sort_order,
    todaySortOrder: row.today_sort_order,
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
  };
}

/* ---------- tasks ---------- */

export function getTasks(userId: string): TaskItem[] {
  const rows = sqlite
    .prepare(
      `SELECT id, title, description, priority, status, due_date, scheduled_date,
        project_id, show_in_week_plan, sort_order, today_sort_order
       FROM tasks WHERE user_id = ?
       ORDER BY sort_order ASC, created_at ASC`
    )
    .all(userId) as TaskRow[];
  return rows.map(mapTask);
}

export function createTask(
  userId: string,
  input: {
    title: string;
    description?: string;
    priority?: TaskItem["priority"];
    dueDate?: string;
    scheduledDate?: string;
    projectId?: string;
    showInWeekPlan?: boolean;
  }
): TaskItem {
  const settings = getSettings(userId);
  const id = randomUUID();
  const timestamp = now();
  const showInWeekPlan =
    input.showInWeekPlan ??
    Boolean(input.projectId && settings.autoAddProjectTaskToWeek);
  const groupWhere = input.projectId
    ? "project_id = ? AND user_id = ?"
    : showInWeekPlan
      ? "show_in_week_plan = 1 AND project_id IS NULL AND user_id = ?"
      : "scheduled_date = ? AND project_id IS NULL AND user_id = ?";
  const groupValue = input.projectId
    ? [input.projectId, userId]
    : [input.scheduledDate ?? input.dueDate ?? "", userId];
  const maxStatement = sqlite.prepare(
    `SELECT COALESCE(MAX(sort_order), -1) as max_order FROM tasks WHERE ${groupWhere}`
  );
  const max = (
    showInWeekPlan && !input.projectId
      ? maxStatement.get(userId)
      : maxStatement.get(...groupValue)
  ) as { max_order: number };
  const todayMax = input.scheduledDate
    ? (
        sqlite
          .prepare(
            "SELECT COALESCE(MAX(today_sort_order), -1) as max_order FROM tasks WHERE scheduled_date = ? AND user_id = ?"
          )
          .get(input.scheduledDate, userId) as { max_order: number }
      ).max_order + 1
    : 0;
  sqlite
    .prepare(
      `INSERT INTO tasks
       (id, user_id, title, description, priority, status, due_date, scheduled_date, project_id,
        show_in_week_plan, sort_order, today_sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      userId,
      input.title.trim(),
      input.description?.trim() ?? "",
      input.priority ?? settings.defaultPriority,
      input.dueDate ?? input.scheduledDate ?? null,
      input.scheduledDate ?? null,
      input.projectId ?? null,
      showInWeekPlan ? 1 : 0,
      max.max_order + 1,
      todayMax,
      timestamp,
      timestamp
    );
  broadcastChange(userId);
  return getTask(userId, id)!;
}

export function getTask(userId: string, id: string): TaskItem | undefined {
  const row = sqlite
    .prepare(
      `SELECT id, title, description, priority, status, due_date, scheduled_date,
        project_id, show_in_week_plan, sort_order, today_sort_order
       FROM tasks WHERE id = ? AND user_id = ?`
    )
    .get(id, userId) as TaskRow | undefined;
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
    dueDate: string;
    scheduledDate: string | null;
    showInWeekPlan: boolean;
  }>
): TaskItem | undefined {
  const current = getTask(userId, id);
  if (!current) return undefined;
  const scheduledDate =
    input.scheduledDate === undefined
      ? current.scheduledDate ?? null
      : input.scheduledDate;
  let todaySortOrder = current.todaySortOrder ?? 0;
  if (scheduledDate && scheduledDate !== current.scheduledDate) {
    const max = sqlite
      .prepare(
        "SELECT COALESCE(MAX(today_sort_order), -1) as max_order FROM tasks WHERE scheduled_date = ? AND user_id = ?"
      )
      .get(scheduledDate, userId) as { max_order: number };
    todaySortOrder = max.max_order + 1;
  }
  const showInWeekPlan = input.showInWeekPlan ?? current.showInWeekPlan ?? false;
  let sortOrder = current.sortOrder ?? 0;
  if (showInWeekPlan && !current.showInWeekPlan) {
    const max = sqlite
      .prepare(
        "SELECT COALESCE(MAX(sort_order), -1) as max_order FROM tasks WHERE show_in_week_plan = 1 AND user_id = ?"
      )
      .get(userId) as { max_order: number };
    sortOrder = max.max_order + 1;
  }
  sqlite
    .prepare(
      `UPDATE tasks SET title = ?, description = ?, priority = ?, status = ?,
       due_date = ?, scheduled_date = ?, show_in_week_plan = ?, sort_order = ?,
       today_sort_order = ?, updated_at = ? WHERE id = ? AND user_id = ?`
    )
    .run(
      input.title?.trim() ?? current.title,
      input.description ?? current.description ?? "",
      input.priority ?? current.priority,
      input.done === undefined
        ? current.done
          ? "done"
          : "todo"
        : input.done
          ? "done"
          : "todo",
      input.dueDate ?? current.dueDate ?? null,
      scheduledDate,
      showInWeekPlan ? 1 : 0,
      sortOrder,
      todaySortOrder,
      now(),
      id,
      userId
    );
  broadcastChange(userId);
  return getTask(userId, id);
}

export function deleteTask(userId: string, id: string): boolean {
  return (
    sqlite
      .prepare("DELETE FROM tasks WHERE id = ? AND user_id = ?")
      .run(id, userId).changes > 0
  );
}

export function reorderTasks(
  userId: string,
  ids: string[],
  scope: "default" | "today" | "scheduled" = "default"
): void {
  const update = sqlite.prepare(
    `UPDATE tasks SET ${scope === "default" ? "sort_order" : "today_sort_order"} = ?, updated_at = ? WHERE id = ? AND user_id = ?`
  );
  const timestamp = now();
  sqlite.transaction(() => {
    ids.forEach((id, index) => update.run(index, timestamp, id, userId));
  })();
}

/* ---------- habits ---------- */

export function getHabits(
  userId: string,
  date: string
): {
  habits: HabitItem[];
  habitLogs: HabitLogItem[];
} {
  const rows = sqlite
    .prepare("SELECT id, name, icon FROM habits WHERE user_id = ? ORDER BY created_at ASC")
    .all(userId) as { id: string; name: string; icon: string }[];
  const logs = sqlite
    .prepare("SELECT habit_id, date FROM habit_logs WHERE user_id = ? ORDER BY date ASC")
    .all(userId) as { habit_id: string; date: string }[];
  return {
    habits: rows.map((habit) => ({
      ...habit,
      checked: logs.some(
        (log) => log.habit_id === habit.id && log.date === date
      ),
    })),
    habitLogs: logs.map((log) => ({
      habitId: log.habit_id,
      date: log.date,
    })),
  };
}

export function toggleHabit(
  userId: string,
  habitId: string,
  date: string
): boolean {
  const found = sqlite
    .prepare("SELECT id FROM habit_logs WHERE habit_id = ? AND date = ? AND user_id = ?")
    .get(habitId, date, userId) as { id: string } | undefined;
  if (found) {
    sqlite.prepare("DELETE FROM habit_logs WHERE id = ? AND user_id = ?").run(found.id, userId);
    return false;
  }
  broadcastChange(userId);
  sqlite
    .prepare(
      "INSERT INTO habit_logs (id, user_id, habit_id, date, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(randomUUID(), userId, habitId, date, now());
  return true;
}

export function createHabit(
  userId: string,
  input: { name: string; icon?: string }
): HabitItem {
  const id = randomUUID();
  sqlite
    .prepare(
      "INSERT INTO habits (id, user_id, name, icon, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(id, userId, input.name.trim(), input.icon ?? "clipboard-check", now());
  return {
    id,
    name: input.name.trim(),
    icon: input.icon ?? "clipboard-check",
    checked: false,
  };
  broadcastChange(userId);
}

export function updateHabit(
  userId: string,
  id: string,
  input: { name?: string; icon?: string },
  date: string
): HabitItem | undefined {
  const current = sqlite
    .prepare("SELECT id, name, icon FROM habits WHERE id = ? AND user_id = ?")
    .get(id, userId) as { id: string; name: string; icon: string } | undefined;
  if (!current) return undefined;
  sqlite
    .prepare("UPDATE habits SET name = ?, icon = ? WHERE id = ? AND user_id = ?")
    .run(input.name?.trim() || current.name, input.icon ?? current.icon, id, userId);
  const checked = Boolean(
    sqlite
      .prepare("SELECT id FROM habit_logs WHERE habit_id = ? AND date = ? AND user_id = ?")
      .get(id, date, userId)
  );
  return {
    id,
    name: input.name?.trim() || current.name,
    icon: input.icon ?? current.icon,
    checked,
  };
}

export function deleteHabit(userId: string, id: string): boolean {
  const found = sqlite
    .prepare("SELECT id FROM habits WHERE id = ? AND user_id = ?")
    .get(id, userId);
  if (!found) return false;
  sqlite.transaction(() => {
    sqlite.prepare("DELETE FROM habit_logs WHERE habit_id = ? AND user_id = ?").run(id, userId);
    sqlite.prepare("DELETE FROM habits WHERE id = ? AND user_id = ?").run(id, userId);
  })();
  return true;
}

/* ---------- projects ---------- */

export function getProjects(userId: string): ProjectItem[] {
  const rows = sqlite
    .prepare(
      "SELECT id, name, description, due_date, show_in_week_plan, pinned, group_name FROM projects WHERE user_id = ? ORDER BY pinned DESC, created_at ASC"
    )
    .all(userId) as ProjectRow[];
  return rows.map(mapProject);
}

export function createProject(
  userId: string,
  input: {
    name: string;
    description?: string;
    dueDate?: string;
  }
): ProjectItem {
  const id = randomUUID();
  const timestamp = now();
  sqlite
    .prepare(
      "INSERT INTO projects (id, user_id, name, description, due_date, show_in_week_plan, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      id,
      userId,
      input.name.trim(),
      input.description ?? "",
      input.dueDate ?? null,
      0,
      timestamp,
      timestamp
    );
  broadcastChange(userId);
  return getProject(userId, id)!;
}

export function getProject(
  userId: string,
  id: string
): ProjectItem | undefined {
  const row = sqlite
    .prepare(
      "SELECT id, name, description, due_date, show_in_week_plan, pinned, group_name FROM projects WHERE id = ? AND user_id = ?"
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
    dueDate: string;
    showInWeekPlan: boolean;
    pinned: boolean;
    groupName: string | null;
  }>
): ProjectItem | undefined {
  const project = getProject(userId, id);
  if (!project) return undefined;
  sqlite
    .prepare(
      "UPDATE projects SET name = ?, description = ?, due_date = ?, show_in_week_plan = ?, pinned = ?, group_name = ?, updated_at = ? WHERE id = ? AND user_id = ?"
    )
    .run(
      input.name?.trim() ?? project.name,
      input.description ?? project.description ?? "",
      input.dueDate ?? project.dueDate ?? null,
      (input.showInWeekPlan ?? project.showInWeekPlan) ? 1 : 0,
      (input.pinned ?? project.pinned) ? 1 : 0,
      input.groupName !== undefined ? input.groupName : (project.groupName ?? null),
      now(),
      id,
      userId
    );
  return getProject(userId, id);
}

export function deleteProject(userId: string, id: string): boolean {
  const project = getProject(userId, id);
  if (!project) return false;
  sqlite.transaction(() => {
    sqlite.prepare("DELETE FROM tasks WHERE project_id = ? AND user_id = ?").run(id, userId);
    sqlite.prepare("DELETE FROM projects WHERE id = ? AND user_id = ?").run(id, userId);
  })();
  return true;
}

export function projectDetails(userId: string, id: string) {
  const project = getProject(userId, id);
  if (!project) return undefined;
  return {
    project,
    tasks: getTasks(userId).filter((task) => task.projectId === id),
  };
}

/* ---------- ideas ---------- */

export function getIdeas(userId: string): IdeaItem[] {
  return sqlite
    .prepare(
      "SELECT id, title, content, created_at as createdAt, updated_at as updatedAt FROM ideas WHERE user_id = ? ORDER BY updated_at DESC"
    )
    .all(userId) as IdeaItem[];
}

export function createIdea(userId: string): IdeaItem {
  const id = randomUUID();
  const timestamp = now();
  sqlite
    .prepare(
      "INSERT INTO ideas (id, user_id, title, content, created_at, updated_at) VALUES (?, ?, '', '', ?, ?)"
    )
    .run(id, userId, timestamp, timestamp);
  broadcastChange(userId);
  return getIdea(userId, id)!;
}

export function getIdea(userId: string, id: string): IdeaItem | undefined {
  return sqlite
    .prepare(
      "SELECT id, title, content, created_at as createdAt, updated_at as updatedAt FROM ideas WHERE id = ? AND user_id = ?"
    )
    .get(id, userId) as IdeaItem | undefined;
}

export function updateIdea(
  userId: string,
  id: string,
  input: { title?: string; content?: string }
): IdeaItem | undefined {
  const idea = getIdea(userId, id);
  if (!idea) return undefined;
  sqlite
    .prepare(
      "UPDATE ideas SET title = ?, content = ?, updated_at = ? WHERE id = ? AND user_id = ?"
    )
    .run(input.title ?? idea.title, input.content ?? idea.content, now(), id, userId);
  return getIdea(userId, id);
}

export function deleteIdea(userId: string, id: string): void {
  sqlite.prepare("DELETE FROM ideas WHERE id = ? AND user_id = ?").run(id, userId);
}

export function convertIdea(
  userId: string,
  id: string,
  kind: "task" | "project",
  date: string
): TaskItem | ProjectItem | undefined {
  const idea = getIdea(userId, id);
  if (!idea || !idea.title.trim()) return undefined;
  const settings = getSettings(userId);
  return sqlite.transaction(() => {
    const result =
      kind === "project"
        ? createProject(userId, { name: idea.title, description: idea.content })
        : createTask(userId, {
            title: idea.title,
            description: idea.content,
            scheduledDate: settings.autoScheduleConvertedIdea ? date : undefined,
            dueDate: settings.autoScheduleConvertedIdea ? date : undefined,
          });
    deleteIdea(userId, id);
    broadcastChange(userId);
    return result;
  })();
}

/* ---------- reading ---------- */

export function normalizeReadingUrl(value: string): string {
  const url = new URL(value.trim());
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith("utm_") || key === "spm") url.searchParams.delete(key);
  }
  return url.toString().replace(/\/$/, "");
}

export function getReadingItems(userId: string): ReadingItem[] {
  const rows = sqlite
    .prepare(
      `SELECT id, url, normalized_url as normalizedUrl, title, notes,
       is_read as isRead, source, created_at as createdAt, updated_at as updatedAt
       FROM reading_items WHERE user_id = ? ORDER BY is_read ASC, updated_at DESC`
    )
    .all(userId) as (Omit<ReadingItem, "isRead"> & { isRead: number })[];
  return rows.map((item) => ({ ...item, isRead: Boolean(item.isRead) }));
}

export function upsertReadingItem(
  userId: string,
  input: {
    url: string;
    title?: string;
    notes?: string;
  }
): { item: ReadingItem; existed: boolean } {
  const normalizedUrl = normalizeReadingUrl(input.url);
  const existing = sqlite
    .prepare(
      "SELECT id FROM reading_items WHERE normalized_url = ? AND user_id = ?"
    )
    .get(normalizedUrl, userId) as { id: string } | undefined;
  const timestamp = now();
  if (existing) {
    sqlite
      .prepare(
        "UPDATE reading_items SET title = ?, notes = ?, updated_at = ? WHERE id = ? AND user_id = ?"
      )
      .run(
        input.title?.trim() || normalizedUrl,
        input.notes ?? "",
        timestamp,
        existing.id,
        userId
      );
    return {
      item: getReadingItems(userId).find((item) => item.id === existing.id)!,
      existed: true,
    };
  }
  const id = randomUUID();
  sqlite
    .prepare(
      `INSERT INTO reading_items
       (id, user_id, url, normalized_url, title, notes, is_read, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'manual', ?, ?)`
    )
    .run(
      id,
      userId,
      input.url.trim(),
      normalizedUrl,
      input.title?.trim() || normalizedUrl,
      input.notes ?? "",
      timestamp,
      timestamp
    );
  return {
    item: getReadingItems(userId).find((item) => item.id === id)!,
    existed: false,
  };
}

export function toggleReadingItem(
  userId: string,
  id: string,
  isRead: boolean
): ReadingItem | undefined {
  sqlite
    .prepare("UPDATE reading_items SET is_read = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .run(isRead ? 1 : 0, now(), id, userId);
  return getReadingItems(userId).find((item) => item.id === id);
}

export function deleteReadingItem(userId: string, id: string): void {
  sqlite.prepare("DELETE FROM reading_items WHERE id = ? AND user_id = ?").run(id, userId);
}

/* ---------- recurring tasks ---------- */

export interface RecurringTask {
  id: string;
  title: string;
  dayOfMonth: number;
  priority: "P1" | "P2" | "P3";
}

export function getRecurringTasks(userId: string): RecurringTask[] {
  return sqlite
    .prepare("SELECT id, title, day_of_month as dayOfMonth, priority FROM recurring_tasks WHERE user_id = ? ORDER BY day_of_month ASC")
    .all(userId) as RecurringTask[];
}

export function createRecurringTask(userId: string, input: { title: string; dayOfMonth: number; priority?: "P1" | "P2" | "P3" }): RecurringTask {
  const id = randomUUID();
  sqlite.prepare("INSERT INTO recurring_tasks (id, user_id, title, day_of_month, priority, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, userId, input.title.trim(), input.dayOfMonth, input.priority ?? "P2", now());
  broadcastChange(userId);
  return getRecurringTasks(userId).find((t) => t.id === id)!;
}

export function updateRecurringTask(userId: string, id: string, input: { title?: string; dayOfMonth?: number; priority?: "P1" | "P2" | "P3" }): RecurringTask | undefined {
  const cur = sqlite.prepare("SELECT id FROM recurring_tasks WHERE id = ? AND user_id = ?").get(id, userId);
  if (!cur) return undefined;
  if (input.title !== undefined || input.dayOfMonth !== undefined || input.priority !== undefined) {
    const f: string[] = []; const v: (string|number)[] = [];
    if (input.title !== undefined) { f.push("title = ?"); v.push(input.title.trim()); }
    if (input.dayOfMonth !== undefined) { f.push("day_of_month = ?"); v.push(input.dayOfMonth); }
    if (input.priority !== undefined) { f.push("priority = ?"); v.push(input.priority); }
    v.push(id, userId);
    sqlite.prepare(`UPDATE recurring_tasks SET ${f.join(", ")} WHERE id = ? AND user_id = ?`).run(...v);
  }
  broadcastChange(userId);
  return getRecurringTasks(userId).find((t) => t.id === id);
}

export function deleteRecurringTask(userId: string, id: string): boolean {
  const r = sqlite.prepare("DELETE FROM recurring_tasks WHERE id = ? AND user_id = ?").run(id, userId);
  if (r.changes > 0) broadcastChange(userId);
  return r.changes > 0;
}

/* ---------- dashboard / week ---------- */

export function dashboardData(userId: string, date: string) {
  const habitData = getHabits(userId, date);
  return {
    tasks: getTasks(userId),
    projects: getProjects(userId),
    settings: getSettings(userId),
    recurringTasks: getRecurringTasks(userId),
    ...habitData,
  };
}

export function weekPlanData(userId: string, startDate: string, endDate: string) {
  const tasks = getTasks(userId);
  const projects = getProjects(userId);
  const weekProjectIds = new Set(
    projects
      .filter((project) => project.showInWeekPlan)
      .map((project) => project.id)
  );
  return {
    projects,
    backlogTasks: tasks.filter(
      (task) =>
        task.showInWeekPlan &&
        !task.projectId &&
        !task.scheduledDate &&
        !task.done
    ),
    projectPoolTasks: tasks.filter(
      (task) =>
        Boolean(task.projectId) &&
        (task.showInWeekPlan || weekProjectIds.has(task.projectId!)) &&
        !task.scheduledDate &&
        !task.done
    ),
    scheduledTasks: tasks.filter(
      (task) =>
        Boolean(task.scheduledDate) &&
        task.scheduledDate! >= startDate &&
        task.scheduledDate! <= endDate
    ),
  };
}
