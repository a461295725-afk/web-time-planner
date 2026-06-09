"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MainLayout from "@/components/layout/main-layout";
import ConsoleHeader from "@/components/console-header";
import HUDCounterBar from "@/components/hud-counter-bar";
import QuickActionBar from "@/components/quick-action-bar";
import HabitCheckInBar from "@/components/habit-check-in-bar";
import TodaySection, { ActiveTaskNotebook } from "@/components/today-section";
import WeekSection from "@/components/week-section";
import MonthCalendarDrawer from "@/components/month-calendar-drawer";
import {
  mockCounters,
  CalendarEventItem,
  HabitItem,
  HabitLogItem,
  ProjectItem,
  TaskItem,
} from "@/lib/mock-data";
import { shiftDate, todayKey, weekStartKey } from "@/lib/date";

interface DashboardPayload {
  habits: HabitItem[];
  habitLogs: HabitLogItem[];
  tasks: TaskItem[];
  projects: ProjectItem[];
  recurringTasks: { id: string; title: string; dayOfMonth: number; priority: "P1" | "P2" | "P3" }[];
}

const TODAY = todayKey();
const events: CalendarEventItem[] = [];

export default function HomePage() {
  const router = useRouter();
  const [habits, setHabits] = useState<HabitItem[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLogItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [recurringTasks, setRecurringTasks] = useState<DashboardPayload["recurringTasks"]>([]);
  const [filterKey, setFilterKey] = useState<string | null>(null);
  const [draggingToToday, setDraggingToToday] = useState(false);
  const [recentlyScheduledIds, setRecentlyScheduledIds] = useState<string[]>([]);
  const [scheduleNotice, setScheduleNotice] = useState<string | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setFetchError(null);
    try {
      const response = await fetch(`/api/dashboard?date=${TODAY}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error(`服务器返回 ${response.status}`);
      }
      const data = (await response.json()) as DashboardPayload;
      setHabits(data.habits);
      setHabitLogs(data.habitLogs);
      setTasks(data.tasks);
      setProjects(data.projects);
      setRecurringTasks(data.recurringTasks ?? []);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "网络连接失败，请检查网络后重试");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  // SSE: 多窗口实时同步
  useEffect(() => {
    const es = new EventSource("/api/events");
    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "change") {
        void loadDashboard();
      }
    };
    es.onerror = () => {
      // EventSource auto-reconnects, no action needed
    };
    return () => es.close();
  }, [loadDashboard]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("newTask") === "1") {
      setQuickAddOpen(true);
      window.history.replaceState({}, "", "/");
    }
  }, []);

  const todayTasks = tasks
    .filter((task) => task.scheduledDate === TODAY)
    .sort((first, second) => {
      const firstNew = recentlyScheduledIds.includes(first.id);
      const secondNew = recentlyScheduledIds.includes(second.id);
      return (
        Number(secondNew) - Number(firstNew) ||
        (first.todaySortOrder ?? 0) - (second.todaySortOrder ?? 0)
      );
    });
  const weekStart = weekStartKey(TODAY);
  const weekEnd = shiftDate(weekStart, 6);
  const weekTasks = tasks.filter(
    (task) =>
      task.showInWeekPlan &&
      !task.projectId &&
      (!task.scheduledDate ||
        (task.scheduledDate >= weekStart && task.scheduledDate <= weekEnd))
  );
  const projectTasks = tasks.filter((task) => task.projectId);
  const weekProjectIds = new Set(
    projects.filter((p) => p.showInWeekPlan).map((p) => p.id)
  );
  const weekProjects = projects.filter((p) => p.showInWeekPlan);
  const weekOpenCount =
    weekTasks.filter((task) => !task.done).length +
    projectTasks.filter(
      (task) => !task.done && weekProjectIds.has(task.projectId!)
    ).length;

  const counters = mockCounters.map((counter) => {
    if (counter.key === "todayCheckins")
      return { ...counter, count: habits.filter((habit) => habit.checked).length };
    if (counter.key === "todayTasks")
      return { ...counter, count: todayTasks.filter((task) => !task.done).length };
    if (counter.key === "weekTasks")
      return { ...counter, count: weekOpenCount };
    return counter;
  });

  const patchTask = async (id: string, input: object) => {
    const response = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...input }),
    });
    if (!response.ok) return;
    const changed = (await response.json()) as TaskItem;
    setTasks((current) =>
      current.map((task) => (task.id === changed.id ? changed : task))
    );
  };

  const handleToggleHabit = async (id: string) => {
    await fetch("/api/habits", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, date: TODAY }),
    });
    await loadDashboard();
  };

  const handleCreateHabit = async (name: string) => {
    await fetch("/api/habits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    await loadDashboard();
    setScheduleNotice(`已新增打卡"${name}"`);
  };

  const handleRenameHabit = async (id: string, name: string) => {
    if (!name.trim()) return;
    await fetch("/api/habits", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name, date: TODAY }),
    });
    await loadDashboard();
    setScheduleNotice("打卡项目已更新");
  };

  const handleDeleteHabit = async (id: string) => {
    await fetch("/api/habits", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await loadDashboard();
    setScheduleNotice("打卡项目已删除");
  };

  const handleToggleTask = (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    void patchTask(id, { done: !task.done });
  };

  const handleDeleteTask = async (id: string) => {
    const task = tasks.find((item) => item.id === id);
    const response = await fetch("/api/tasks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) return;
    setTasks((current) => current.filter((item) => item.id !== id));
    setScheduleNotice(`"${task?.title ?? "任务"}"已删除`);
  };

  const handlePostpone = async (id: string) => {
    await patchTask(id, { scheduledDate: null, showInWeekPlan: true });
    const task = tasks.find((t) => t.id === id);
    setScheduleNotice(`"${task?.title ?? id}"已推迟到本周计划`);
  };

  const handleAddTask = async (date: string, title: string) => {
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, scheduledDate: date }),
    });
    await loadDashboard();
    setScheduleNotice(`已在${date}添加"${title}"`);
  };

  const handleAddRecurring = async (title: string, dayOfMonth: number) => {
    await fetch("/api/recurring-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, dayOfMonth }),
    });
    await loadDashboard();
    setScheduleNotice(`已添加每月${dayOfMonth}日"${title}"`);
  };

  const handleDeleteRecurring = async (id: string) => {
    await fetch("/api/recurring-tasks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await loadDashboard();
    setScheduleNotice("每月固定任务已删除");
  };

  const handleQuickAdd = async (title: string) => {
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, scheduledDate: TODAY, priority: "P2" }),
    });
    if (!response.ok) return;
    const created = (await response.json()) as TaskItem;
    setTasks((current) => [...current, created]);
    setRecentlyScheduledIds((ids) => [created.id, ...ids]);
    setScheduleNotice(`"${created.title}" 已加入今日`);
    setQuickAddOpen(false);
  };

  const handleScheduleToday = async (taskId: string) => {
    await patchTask(taskId, { scheduledDate: TODAY });
    setRecentlyScheduledIds((ids) => [taskId, ...ids]);
    const task = tasks.find((t) => t.id === taskId);
    setScheduleNotice(`"${task?.title ?? taskId}" 已安排到今天`);
    setDraggingToToday(false);
  };

  const handleScheduleProjectToday = async (projectId: string) => {
    const childTasks = tasks.filter((t) => t.projectId === projectId && !t.done);
    for (const t of childTasks) {
      await patchTask(t.id, { scheduledDate: TODAY });
    }
    setRecentlyScheduledIds((ids) => [...childTasks.map((t) => t.id), ...ids]);
    const project = projects.find((p) => p.id === projectId);
    setScheduleNotice(`"${project?.name ?? projectId}" 的子任务已全部安排到今天`);
    setDraggingToToday(false);
  };

  const handleReorderTodayTask = async (draggedId: string, targetId: string) => {
    const open = todayTasks.filter((t) => !t.done);
    const idx = open.findIndex((t) => t.id === targetId);
    if (idx < 0) return;
    const ordered = open.filter((t) => t.id !== draggedId);
    ordered.splice(idx, 0, open.find((t) => t.id === draggedId)!);
    const all = tasks.map((t) => {
      if (t.id === draggedId) return { ...t, todaySortOrder: idx };
      if (t.id === targetId) return { ...t, todaySortOrder: ordered.findIndex((o) => o.id === t.id) };
      return t;
    });
    setTasks(all);
    await fetch("/api/tasks/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ordered.map((t) => t.id), scope: "scheduled" }),
    });
  };

  const handleReorderWeekTask = async (draggedId: string, targetId: string) => {
    const idx = weekTasks.findIndex((t) => t.id === targetId);
    if (idx < 0) return;
    const ordered = weekTasks.filter((t) => t.id !== draggedId);
    ordered.splice(idx, 0, weekTasks.find((t) => t.id === draggedId)!);
    const ids = ordered.map((t) => t.id);
    setTasks((current) =>
      current.map((t) => {
        const pos = ids.indexOf(t.id);
        return pos >= 0 ? { ...t, sortOrder: pos } : t;
      })
    );
    await fetch("/api/tasks/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, scope: "default" }),
    });
  };

  useEffect(() => {
    if (!scheduleNotice) return;
    const timeout = window.setTimeout(() => {
      setScheduleNotice(null);
      setRecentlyScheduledIds([]);
    }, 2600);
    return () => window.clearTimeout(timeout);
  }, [scheduleNotice]);

  return (
    <MainLayout>
      <ConsoleHeader />
      {fetchError ? (
        <div className="mb-6 rounded-xl border border-red-400/30 bg-red-400/10 px-5 py-4 text-center">
          <p className="text-sm text-red-300 mb-3">{fetchError}</p>
          <button
            onClick={() => { setLoading(true); void loadDashboard(); }}
            className="rounded-full bg-red-400/20 px-4 py-1.5 text-xs font-medium text-red-200 hover:bg-red-400/30 transition-colors"
          >
            点击重试
          </button>
        </div>
      ) : (
        <>
          <div className="mb-4 sm:mb-5">
            <HUDCounterBar
              counters={loading ? [{ key: "loading", label: "加载中...", count: 0 }] : counters}
              activeKey={filterKey}
              onFilter={setFilterKey}
            />
          </div>
      <div className="mb-5 flex flex-col gap-3 border-b border-white/[0.07] pb-5 lg:mb-6 lg:flex-row lg:items-center lg:justify-between">
        <QuickActionBar onCreateTask={() => setQuickAddOpen(true)} />
        <HabitCheckInBar
          habits={habits}
          onToggle={handleToggleHabit}
          onCreate={handleCreateHabit}
          onRename={handleRenameHabit}
          onDelete={handleDeleteHabit}
        />
      </div>
        </>
      )}

      {loading && !fetchError && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="h-2 w-48 animate-pulse rounded-full bg-white/10" />
          <div className="h-2 w-32 animate-pulse rounded-full bg-white/5" />
          <p className="text-xs text-text-muted mt-2">正在加载数据...</p>
        </div>
      )}

      {!loading && !fetchError && (
      <>
      {/* Desktop dual-column */}
      <div className="hidden gap-4 sm:gap-5 md:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.9fr)] xl:grid-cols-[minmax(0,1.5fr)_minmax(350px,0.9fr)] xl:gap-5">
        <div className="flex flex-col gap-4 sm:gap-5">
          <TodaySection
            tasks={todayTasks}
            projects={projects}
            onToggle={handleToggleTask}
            onDelete={handleDeleteTask}
            onPostpone={handlePostpone}
            onReorder={handleReorderTodayTask}
            isDragTargetActive={draggingToToday}
            recentlyScheduledIds={recentlyScheduledIds}
            quickAddOpen={quickAddOpen}
            onQuickAdd={handleQuickAdd}
            onCancelQuickAdd={() => setQuickAddOpen(false)}
          />
          <ActiveTaskNotebook
            tasks={todayTasks}
            onSaveNote={(id, description) => {
              void patchTask(id, { description });
              setScheduleNotice("任务备注已保存");
            }}
          />
        </div>
        <WeekSection
          tasks={weekTasks}
          projects={weekProjects}
          projectTasks={projectTasks}
          onToggleTask={handleToggleTask}
          onDeleteTask={handleDeleteTask}
          onScheduleTask={handleScheduleToday}
          onScheduleProject={handleScheduleProjectToday}
          onReorderTask={handleReorderWeekTask}
          onDraggingChange={setDraggingToToday}
          onOpenProject={(id) => router.push(`/projects/${id}`)}
        />
      </div>

      {/* Mobile tabs */}
      <TabsView
        todayTasks={todayTasks}
        weekTasks={weekTasks}
        projects={projects}
        projectTasks={projectTasks}
        quickAddOpen={quickAddOpen}
        onQuickAdd={handleQuickAdd}
        onCancelQuickAdd={() => setQuickAddOpen(false)}
        onToggleTask={handleToggleTask}
        onDeleteTask={handleDeleteTask}
        onPostponeTask={handlePostpone}
        onReorderTodayTask={handleReorderTodayTask}
        onScheduleTask={handleScheduleToday}
        onScheduleProject={handleScheduleProjectToday}
        onReorderTask={handleReorderWeekTask}
        onDraggingChange={setDraggingToToday}
        draggingToToday={draggingToToday}
        recentlyScheduledIds={recentlyScheduledIds}
        onOpenProject={(id) => router.push(`/projects/${id}`)}
      />
      </>
      )}

      <MonthCalendarDrawer
        tasks={tasks}
        events={events}
        habits={habits}
        habitLogs={habitLogs}
        recurringTasks={recurringTasks}
        onDeleteTask={handleDeleteTask}
        onAddTask={handleAddTask}
        onAddRecurring={handleAddRecurring}
        onDeleteRecurring={handleDeleteRecurring}
      />

      {scheduleNotice && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-accent-green/35 bg-[#182014] px-4 py-2.5 text-sm text-accent-green shadow-[0_0_26px_rgba(156,255,109,0.18)]">
          {scheduleNotice}
        </div>
      )}
    </MainLayout>
  );
}

function TabsView({
  todayTasks,
  weekTasks,
  projects,
  projectTasks,
  quickAddOpen,
  onQuickAdd,
  onCancelQuickAdd,
  onToggleTask,
  onDeleteTask,
  onPostponeTask,
  onReorderTodayTask,
  onScheduleTask,
  onScheduleProject,
  onReorderTask,
  onDraggingChange,
  draggingToToday,
  recentlyScheduledIds,
  onOpenProject,
}: {
  todayTasks: TaskItem[];
  weekTasks: TaskItem[];
  projects: ProjectItem[];
  projectTasks: TaskItem[];
  quickAddOpen: boolean;
  onQuickAdd: (title: string) => void;
  onCancelQuickAdd: () => void;
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onPostponeTask: (id: string) => void;
  onReorderTodayTask: (draggedId: string, targetId: string) => void;
  onScheduleTask: (taskId: string) => void;
  onScheduleProject: (projectId: string) => void;
  onReorderTask: (draggedId: string, targetId: string) => void;
  onDraggingChange: (dragging: boolean) => void;
  draggingToToday: boolean;
  recentlyScheduledIds: string[];
  onOpenProject: (projectId: string) => void;
}) {
  const weekProjects = projects.filter((p) => p.showInWeekPlan);
  const [tab, setTab] = useState<"today" | "week">("today");
  useEffect(() => {
    if (quickAddOpen) setTab("today");
  }, [quickAddOpen]);
  return (
    <div className="mt-3 block md:hidden">
      <div className="mb-4 flex rounded-full border border-card-border bg-card/70 p-1">
        <button
          data-drop-zone={tab === "week" ? "today" : undefined}
          onClick={() => setTab("today")}
          className={`flex-1 rounded-full py-2.5 text-sm font-medium transition-all duration-200 ${
            tab === "today"
              ? "bg-accent-green text-[#10120d]"
              : draggingToToday
                ? "border border-accent-green/50 bg-accent-green/10 text-accent-green"
                : "text-text-muted"
          }`}
        >
          {tab === "week" && draggingToToday ? "拖到这里安排今日" : "今日"}
        </button>
        <button
          onClick={() => setTab("week")}
          className={`flex-1 rounded-full py-2.5 text-sm font-medium transition-all duration-200 ${
            tab === "week" ? "bg-accent-purple text-[#101116]" : "text-text-muted"
          }`}
        >
          本周
        </button>
      </div>
      {tab === "today" ? (
        <TodaySection
          tasks={todayTasks}
          projects={projects}
          onToggle={onToggleTask}
          onDelete={onDeleteTask}
          onPostpone={onPostponeTask}
          onReorder={onReorderTodayTask}
          recentlyScheduledIds={recentlyScheduledIds}
          quickAddOpen={quickAddOpen}
          onQuickAdd={onQuickAdd}
          onCancelQuickAdd={onCancelQuickAdd}
        />
      ) : (
        <WeekSection
          tasks={weekTasks}
          projects={weekProjects}
          projectTasks={projectTasks}
          onToggleTask={onToggleTask}
          onDeleteTask={onDeleteTask}
          onScheduleTask={onScheduleTask}
          onScheduleProject={onScheduleProject}
          onReorderTask={onReorderTask}
          onDraggingChange={onDraggingChange}
          onOpenProject={onOpenProject}
        />
      )}
    </div>
  );
}
