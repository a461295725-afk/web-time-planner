import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

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
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

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

export const readingItems = sqliteTable("reading_items", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().default(""),
  url: text("url").notNull(),
  normalizedUrl: text("normalized_url").notNull().unique(),
  title: text("title").notNull(),
  notes: text("notes").notNull().default(""),
  isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
  source: text("source").notNull().default("manual"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

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
