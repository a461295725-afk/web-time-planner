import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().default(""),
  name: text("name").notNull(),
  description: text("description"),
  dueDate: text("due_date"),
  showInWeekPlan: integer("show_in_week_plan", { mode: "boolean" })
    .notNull()
    .default(false),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  groupName: text("group_name"),
  projectOrder: integer("project_order").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const projectGroups = sqliteTable(
  "project_groups",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().default(""),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    userNameIdx: uniqueIndex("idx_project_groups_user_name").on(
      table.userId,
      table.name
    ),
  })
);

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().default(""),
  title: text("title").notNull(),
  description: text("description"),
  priority: text("priority", { enum: ["P1", "P2", "P3"] })
    .notNull()
    .default("P2"),
  status: text("status", { enum: ["todo", "done", "overdue"] })
    .notNull()
    .default("todo"),
  dueDate: text("due_date"),
  scheduledDate: text("scheduled_date"),
  projectId: text("project_id").references(() => projects.id),
  showInWeekPlan: integer("show_in_week_plan", { mode: "boolean" })
    .notNull()
    .default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  todaySortOrder: integer("today_sort_order").notNull().default(0),
  estimatedMinutes: integer("estimated_minutes"),
  energyLevel: text("energy_level", { enum: ["low", "medium", "high"] }),
  preferredPeriod: text("preferred_period", {
    enum: ["morning", "afternoon", "evening", "anytime"],
  }),
  completedAt: integer("completed_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const habits = sqliteTable("habits", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().default(""),
  name: text("name").notNull(),
  icon: text("icon").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const habitLogs = sqliteTable("habit_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().default(""),
  habitId: text("habit_id")
    .notNull()
    .references(() => habits.id),
  date: text("date").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const ideas = sqliteTable("ideas", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().default(""),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const readingItems = sqliteTable(
  "reading_items",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().default(""),
    url: text("url").notNull(),
    normalizedUrl: text("normalized_url").notNull(),
    title: text("title").notNull(),
    notes: text("notes").notNull().default(""),
    isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
    source: text("source").notNull().default("manual"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    userNormalizedUrl: uniqueIndex("idx_reading_items_user_normalized_url").on(
      table.userId,
      table.normalizedUrl
    ),
    userUpdated: index("idx_reading_items_user_updated").on(
      table.userId,
      table.updatedAt
    ),
  })
);

export const appSettings = sqliteTable(
  "app_settings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().default(""),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    userKey: uniqueIndex("idx_app_settings_user_key").on(table.userId, table.key),
  })
);

export const recurringTasks = sqliteTable("recurring_tasks", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().default(""),
  title: text("title").notNull(),
  dayOfMonth: integer("day_of_month").notNull(),
  priority: text("priority", { enum: ["P1", "P2", "P3"] })
    .notNull()
    .default("P2"),
  createdAt: integer("created_at").notNull(),
});

export const hermesApiTokens = sqliteTable("hermes_api_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  tokenHash: text("token_hash").notNull().unique(),
  tokenLast4: text("token_last4").notNull(),
  createdAt: integer("created_at").notNull(),
  rotatedAt: integer("rotated_at"),
  revokedAt: integer("revoked_at"),
});

export const hermesLegacyTokens = sqliteTable("hermes_legacy_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().default(""),
  tokenHash: text("token_hash").notNull().unique(),
  tokenLast4: text("token_last4").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const dayPlans = sqliteTable(
  "day_plans",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    date: text("date").notNull(),
    status: text("status", { enum: ["draft", "confirmed", "rejected"] })
      .notNull()
      .default("draft"),
    source: text("source", { enum: ["rules", "ai", "manual"] })
      .notNull()
      .default("rules"),
    version: integer("version").notNull().default(1),
    summary: text("summary").notNull().default(""),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    confirmedAt: integer("confirmed_at"),
  },
  (table) => ({
    userDate: uniqueIndex("idx_day_plans_user_date").on(table.userId, table.date),
  })
);

export const dayPlanItems = sqliteTable(
  "day_plan_items",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    planId: text("plan_id").notNull().references(() => dayPlans.id, { onDelete: "cascade" }),
    taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["proposed", "accepted", "rejected"] })
      .notNull()
      .default("proposed"),
    block: text("block", { enum: ["morning", "afternoon", "evening"] }).notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
    position: integer("position").notNull().default(0),
    reason: text("reason").notNull().default(""),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    planTask: uniqueIndex("idx_day_plan_items_plan_task").on(table.planId, table.taskId),
    planPosition: index("idx_day_plan_items_plan_position").on(table.planId, table.position),
  })
);

export const focusSessions = sqliteTable(
  "focus_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    planItemId: text("plan_item_id").references(() => dayPlanItems.id, { onDelete: "set null" }),
    date: text("date").notNull(),
    startedAt: integer("started_at").notNull(),
    endedAt: integer("ended_at"),
    durationSeconds: integer("duration_seconds"),
    status: text("status", { enum: ["running", "completed", "cancelled"] })
      .notNull()
      .default("running"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    userDate: index("idx_focus_sessions_user_date").on(table.userId, table.date),
  })
);

export const planningFeedbackEvents = sqliteTable(
  "planning_feedback_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    planId: text("plan_id"),
    taskId: text("task_id"),
    date: text("date").notNull(),
    eventType: text("event_type").notNull(),
    payloadJson: text("payload_json").notNull().default("{}"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => ({
    userDate: index("idx_feedback_user_date").on(table.userId, table.date, table.createdAt),
  })
);

export const reviews = sqliteTable(
  "reviews",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    periodType: text("period_type", { enum: ["daily", "weekly"] }).notNull(),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    wins: text("wins").notNull().default(""),
    blockers: text("blockers").notNull().default(""),
    nextAction: text("next_action").notNull().default(""),
    notes: text("notes").notNull().default(""),
    metricsJson: text("metrics_json").notNull().default("{}"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    userPeriod: uniqueIndex("idx_reviews_user_period").on(
      table.userId,
      table.periodType,
      table.periodStart
    ),
  })
);

export const taskCarryovers = sqliteTable(
  "task_carryovers",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    taskId: text("task_id").notNull(),
    sourceDate: text("source_date").notNull(),
    targetDate: text("target_date").notNull(),
    action: text("action", { enum: ["move_next_day", "return_to_week"] }).notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => ({
    uniqueCarryover: uniqueIndex("idx_task_carryovers_unique").on(
      table.userId,
      table.taskId,
      table.sourceDate,
      table.targetDate
    ),
  })
);

export const agentMemories = sqliteTable(
  "agent_memories",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    category: text("category", {
      enum: ["explicit", "preference", "behavior", "context"],
    }).notNull(),
    key: text("key").notNull(),
    valueJson: text("value_json").notNull(),
    source: text("source", { enum: ["user", "inferred", "system"] }).notNull(),
    evidenceCount: integer("evidence_count").notNull().default(1),
    confidence: real("confidence").notNull().default(1),
    confirmed: integer("confirmed", { mode: "boolean" }).notNull().default(false),
    lastEvidenceAt: integer("last_evidence_at").notNull(),
    expiresAt: integer("expires_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    userCategoryKey: uniqueIndex("idx_agent_memories_user_category_key").on(
      table.userId,
      table.category,
      table.key
    ),
  })
);
