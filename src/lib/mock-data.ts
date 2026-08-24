export interface CounterData {
  label: string;
  count: number;
  key: string;
}

export interface HabitItem {
  id: string;
  name: string;
  icon: string;
  checked: boolean;
}

export interface TaskItem {
  id: string;
  title: string;
  description?: string;
  priority: "P1" | "P2" | "P3";
  done: boolean;
  dueDate: string;
  scheduledDate?: string;
  projectId?: string;
  showInWeekPlan?: boolean;
  sortOrder?: number;
  todaySortOrder?: number;
  estimatedMinutes?: number;
  energyLevel?: "low" | "medium" | "high";
  preferredPeriod?: "morning" | "afternoon" | "evening" | "anytime";
  completedAt?: number;
}

export interface ProjectItem {
  id: string;
  name: string;
  dueDate: string;
  description?: string;
  showInWeekPlan?: boolean;
  pinned?: boolean;
  groupName?: string;
  projectOrder?: number;
}

export interface ProjectGroupItem {
  id: string;
  name: string;
  sortOrder: number;
}

export interface IdeaItem {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface ReadingItem {
  id: string;
  url: string;
  normalizedUrl: string;
  title: string;
  notes: string;
  isRead: boolean;
  source: string;
  createdAt: number;
  updatedAt: number;
}

export interface CalendarEventItem {
  id: string;
  title: string;
  date: string;
  time: string;
}

export interface HabitLogItem {
  habitId: string;
  date: string;
}

export const mockCounters: CounterData[] = [
  { label: "今日打卡", count: 2, key: "todayCheckins" },
  { label: "今日待办", count: 5, key: "todayTasks" },
  { label: "本周待办", count: 12, key: "weekTasks" },
];

export const mockHabits: HabitItem[] = [
  { id: "1", name: "健身", icon: "dumbbell", checked: true },
  { id: "2", name: "复盘", icon: "clipboard-check", checked: true },
  { id: "3", name: "阅读", icon: "book-open", checked: false },
  { id: "4", name: "冥想", icon: "flower-2", checked: false },
];

export const mockProjects: ProjectItem[] = [
  {
    id: "p1",
    name: "智能客服 MVP",
    dueDate: "2026-05-30",
  },
  {
    id: "p2",
    name: "数据分析中台",
    dueDate: "2026-05-31",
  },
  {
    id: "p3",
    name: "官网改版 v3",
    dueDate: "2026-06-01",
  },
];

// A task is stored once and may surface in more than one view.
// For example, p1-2 belongs to a project and is also due today.
export const mockTasks: TaskItem[] = [
  { id: "t1", title: "完成产品需求文档评审", priority: "P1", done: false, dueDate: "2026-05-25", scheduledDate: "2026-05-25" },
  { id: "t2", title: "回复投资人邮件", priority: "P1", done: false, dueDate: "2026-05-25", scheduledDate: "2026-05-25" },
  { id: "t3", title: "Review 技术方案", priority: "P2", done: false, dueDate: "2026-05-25", scheduledDate: "2026-05-25" },
  { id: "t4", title: "更新项目管理看板", priority: "P2", done: true, dueDate: "2026-05-25", scheduledDate: "2026-05-25" },
  { id: "w1", title: "Q2 OKR 复盘", priority: "P1", done: false, dueDate: "2026-05-28", showInWeekPlan: true },
  { id: "w2", title: "面试前端工程师", priority: "P1", done: false, dueDate: "2026-05-27", showInWeekPlan: true },
  { id: "w3", title: "与设计团队对齐新功能交互", priority: "P2", done: false, dueDate: "2026-05-29", showInWeekPlan: true },
  { id: "w4", title: "准备投资人月报材料", priority: "P2", done: false, dueDate: "2026-05-30", showInWeekPlan: true },
  { id: "w5", title: "更新用户调研问卷", priority: "P3", done: false, dueDate: "2026-05-31", showInWeekPlan: true },
  { id: "p1-1", title: "整理高频咨询意图", priority: "P1", done: true, dueDate: "2026-05-26", projectId: "p1" },
  { id: "p1-2", title: "确认首轮回答话术", priority: "P1", done: false, dueDate: "2026-05-28", scheduledDate: "2026-05-25", projectId: "p1" },
  { id: "p1-3", title: "联调客服入口与回退策略", priority: "P1", done: false, dueDate: "2026-05-30", projectId: "p1" },
  { id: "p2-1", title: "核对指标口径", priority: "P1", done: true, dueDate: "2026-05-27", projectId: "p2" },
  { id: "p2-2", title: "搭建核心看板原型", priority: "P2", done: false, dueDate: "2026-05-29", projectId: "p2" },
  { id: "p2-3", title: "评审数据权限范围", priority: "P2", done: false, dueDate: "2026-05-31", projectId: "p2" },
  { id: "p3-1", title: "定稿首页视觉方向", priority: "P2", done: true, dueDate: "2026-05-26", projectId: "p3" },
  { id: "p3-2", title: "补齐响应式页面稿", priority: "P2", done: false, dueDate: "2026-05-29", projectId: "p3" },
  { id: "p3-3", title: "准备上线检查清单", priority: "P3", done: false, dueDate: "2026-06-01", projectId: "p3" },
];

export const mockCalendarEvents: CalendarEventItem[] = [
  { id: "e1", title: "产品周会", date: "2026-05-26", time: "10:00" },
  { id: "e2", title: "与设计团队同步", date: "2026-05-28", time: "14:30" },
  { id: "e3", title: "月度复盘会议", date: "2026-05-30", time: "16:00" },
];

export const mockHabitLogs: HabitLogItem[] = [
  ...[1, 2, 4, 5, 7, 8, 11, 12, 14, 15, 18, 19, 21, 22, 25].map((day) => ({
    habitId: "1",
    date: `2026-05-${String(day).padStart(2, "0")}`,
  })),
  ...[1, 2, 3, 5, 6, 8, 9, 12, 13, 15, 16, 19, 20, 22, 23, 25].map(
    (day) => ({
      habitId: "2",
      date: `2026-05-${String(day).padStart(2, "0")}`,
    })
  ),
  ...[2, 4, 6, 9, 11, 13, 16, 18, 20, 23].map((day) => ({
    habitId: "3",
    date: `2026-05-${String(day).padStart(2, "0")}`,
  })),
  ...[3, 6, 10, 14, 17, 21, 24].map((day) => ({
    habitId: "4",
    date: `2026-05-${String(day).padStart(2, "0")}`,
  })),
];
