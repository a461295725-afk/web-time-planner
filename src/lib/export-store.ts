import { createHash } from "node:crypto";
import { sqlite } from "@/db";

const SAFE_SETTING_KEYS = new Set([
  "theme",
  "aiProvider",
  "aiModel",
  "defaultPriority",
  "autoAddProjectTaskToWeek",
  "autoScheduleConvertedIdea",
  "smartDayWindows",
  "smartDayCapacityMinutes",
]);
const SENSITIVE_KEY_RE = /(password|passwd|token|secret|api[_-]?key|private[_-]?key|credential)/i;

export interface ExportEnvelope {
  format: "web-time-planner-export";
  version: 1;
  exportedAt: number;
  user: { username: string };
  counts: Record<string, number>;
  data: Record<string, unknown>;
  sha256: string;
}

function parseJson(value: string, fallback: unknown = {}): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return fallback;
  }
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_RE.test(key);
}

function sanitize(value: unknown, key?: string): unknown {
  if (key && isSensitiveKey(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([entryKey]) => !isSensitiveKey(entryKey))
        .map(([entryKey, entryValue]) => [entryKey, sanitize(entryValue, entryKey)])
    );
  }
  if (typeof value === "string") {
    if (/(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|eyJ[A-Za-z0-9_-]{24,}\.|-----BEGIN [A-Z ]*PRIVATE KEY-----)/.test(value)) {
      return "[REDACTED]";
    }
  }
  return value;
}

function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entryValue]) => [key, canonicalise(entryValue)])
    );
  }
  return value;
}

export function canonicalExportJson(value: unknown): string {
  return JSON.stringify(canonicalise(value));
}

function countRows(data: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      Array.isArray(value)
        ? value.length
        : value && typeof value === "object"
          ? Object.keys(value as Record<string, unknown>).length
          : 0,
    ])
  );
}

export function createUserExport(userId: string, username: string): ExportEnvelope {
  const settings = sqlite
    .prepare(
      `SELECT key, value
       FROM app_settings
       WHERE user_id = ? AND key IN (${[...SAFE_SETTING_KEYS].map(() => "?").join(",")})
       ORDER BY key ASC`
    )
    .all(userId, ...SAFE_SETTING_KEYS) as { key: string; value: string }[];

  const data: Record<string, unknown> = {
    settings: Object.fromEntries(settings.filter((row) => SAFE_SETTING_KEYS.has(row.key)).map((row) => [row.key, row.value])),
    projects: sqlite
      .prepare(
        `SELECT id, name, description, due_date AS dueDate, show_in_week_plan AS showInWeekPlan,
          pinned, group_name AS groupName, project_order AS projectOrder, created_at AS createdAt,
          updated_at AS updatedAt
         FROM projects WHERE user_id = ? ORDER BY created_at ASC`
      )
      .all(userId),
    projectGroups: sqlite
      .prepare(
        `SELECT id, name, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt
         FROM project_groups WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC`
      )
      .all(userId),
    tasks: sqlite
      .prepare(
        `SELECT id, title, description, priority, status, due_date AS dueDate,
          scheduled_date AS scheduledDate, project_id AS projectId, show_in_week_plan AS showInWeekPlan,
          sort_order AS sortOrder, today_sort_order AS todaySortOrder, estimated_minutes AS estimatedMinutes,
          energy_level AS energyLevel, preferred_period AS preferredPeriod, completed_at AS completedAt,
          created_at AS createdAt, updated_at AS updatedAt
         FROM tasks WHERE user_id = ? ORDER BY created_at ASC`
      )
      .all(userId),
    habits: sqlite
      .prepare(
        `SELECT id, name, icon, created_at AS createdAt
         FROM habits WHERE user_id = ? ORDER BY created_at ASC`
      )
      .all(userId),
    habitLogs: sqlite
      .prepare(
        `SELECT id, habit_id AS habitId, date, created_at AS createdAt
         FROM habit_logs WHERE user_id = ? ORDER BY date ASC, created_at ASC`
      )
      .all(userId),
    ideas: sqlite
      .prepare(
        `SELECT id, title, content, created_at AS createdAt, updated_at AS updatedAt
         FROM ideas WHERE user_id = ? ORDER BY updated_at DESC`
      )
      .all(userId),
    readingItems: sqlite
      .prepare(
        `SELECT id, url, normalized_url AS normalizedUrl, title, notes, is_read AS isRead,
          source, created_at AS createdAt, updated_at AS updatedAt
         FROM reading_items WHERE user_id = ? ORDER BY updated_at DESC`
      )
      .all(userId),
    recurringTasks: sqlite
      .prepare(
        `SELECT id, title, day_of_month AS dayOfMonth, priority, created_at AS createdAt
         FROM recurring_tasks WHERE user_id = ? ORDER BY day_of_month ASC`
      )
      .all(userId),
    dayPlans: sqlite
      .prepare(
        `SELECT id, date, status, source, version, summary, created_at AS createdAt,
          updated_at AS updatedAt, confirmed_at AS confirmedAt
         FROM day_plans WHERE user_id = ? ORDER BY date ASC`
      )
      .all(userId),
    dayPlanItems: sqlite
      .prepare(
        `SELECT id, plan_id AS planId, task_id AS taskId, status, block,
          start_minute AS startMinute, end_minute AS endMinute, position, reason,
          created_at AS createdAt, updated_at AS updatedAt
         FROM day_plan_items WHERE user_id = ? ORDER BY plan_id ASC, position ASC`
      )
      .all(userId),
    focusSessions: sqlite
      .prepare(
        `SELECT id, task_id AS taskId, plan_item_id AS planItemId, date,
          started_at AS startedAt, ended_at AS endedAt, duration_seconds AS durationSeconds,
          status, created_at AS createdAt, updated_at AS updatedAt
         FROM focus_sessions WHERE user_id = ? ORDER BY started_at ASC`
      )
      .all(userId),
    planningFeedbackEvents: sqlite
      .prepare(
        `SELECT id, plan_id AS planId, task_id AS taskId, date, event_type AS eventType,
          payload_json AS payloadJson, created_at AS createdAt
         FROM planning_feedback_events WHERE user_id = ? ORDER BY created_at ASC`
      )
      .all(userId)
      .map((row) => {
        const typed = row as { payloadJson: string };
        return { ...typed, payload: sanitize(parseJson(typed.payloadJson)), payloadJson: undefined };
      }),
    reviews: sqlite
      .prepare(
        `SELECT id, period_type AS periodType, period_start AS periodStart, period_end AS periodEnd,
          wins, blockers, next_action AS nextAction, notes, metrics_json AS metricsJson,
          created_at AS createdAt, updated_at AS updatedAt
         FROM reviews WHERE user_id = ? ORDER BY period_start ASC`
      )
      .all(userId)
      .map((row) => {
        const typed = row as { metricsJson: string };
        return { ...typed, metrics: sanitize(parseJson(typed.metricsJson)), metricsJson: undefined };
      }),
    taskCarryovers: sqlite
      .prepare(
        `SELECT id, task_id AS taskId, source_date AS sourceDate, target_date AS targetDate,
          action, created_at AS createdAt
         FROM task_carryovers WHERE user_id = ? ORDER BY created_at ASC`
      )
      .all(userId),
    agentMemories: sqlite
      .prepare(
        `SELECT id, category, key, value_json AS valueJson, source,
          evidence_count AS evidenceCount, confidence, confirmed,
          last_evidence_at AS lastEvidenceAt, expires_at AS expiresAt,
          created_at AS createdAt, updated_at AS updatedAt
         FROM agent_memories
         WHERE user_id = ? AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY updated_at DESC`
      )
      .all(userId, Date.now())
      .map((row) => {
        const typed = row as { valueJson: string };
        return { ...typed, value: sanitize(parseJson(typed.valueJson)), valueJson: undefined };
      }),
  };

  const safeData = sanitize(data) as Record<string, unknown>;
  const envelopeWithoutHash = {
    format: "web-time-planner-export" as const,
    version: 1 as const,
    exportedAt: Date.now(),
    user: { username },
    counts: countRows(safeData),
    data: safeData,
  };
  const sha256 = createHash("sha256")
    .update(canonicalExportJson(envelopeWithoutHash), "utf8")
    .digest("hex");
  return { ...envelopeWithoutHash, sha256 };
}
