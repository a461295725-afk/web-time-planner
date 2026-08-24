"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { animate, motion, PanInfo, useMotionValue } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  FolderKanban,
  GripVertical,
  ListPlus,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import WorkspaceShell from "@/components/workspace-shell";
import MonthCalendarDrawer from "@/components/month-calendar-drawer";
import { HabitItem, HabitLogItem, ProjectItem, TaskItem } from "@/lib/mock-data";
import {
  displayWeekRange,
  shiftDate,
  todayKey,
  weekDateKeys,
  weekStartKey,
} from "@/lib/date";

interface WeekPayload {
  startDate: string;
  projects: ProjectItem[];
  backlogTasks: TaskItem[];
  projectPoolTasks: TaskItem[];
  scheduledTasks: TaskItem[];
}

interface CalendarPayload {
  tasks: TaskItem[];
  habits: HabitItem[];
  habitLogs: HabitLogItem[];
}

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export default function WeekPlannerWorkspace() {
  const [currentStart, setCurrentStart] = useState(() => weekStartKey(todayKey()));
  const [startDate, setStartDate] = useState(currentStart);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [backlogTasks, setBacklogTasks] = useState<TaskItem[]>([]);
  const [projectPoolTasks, setProjectPoolTasks] = useState<TaskItem[]>([]);
  const [scheduledTasks, setScheduledTasks] = useState<TaskItem[]>([]);
  const [calendarTasks, setCalendarTasks] = useState<TaskItem[]>([]);
  const [habits, setHabits] = useState<HabitItem[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLogItem[]>([]);
  const [expandedProjects, setExpandedProjects] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const startDateRef = useRef(startDate);
  startDateRef.current = startDate;
  const [dragging, setDragging] = useState(false);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [hoveredPool, setHoveredPool] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const blockClickUntil = useRef(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = weekStartKey(todayKey());
      setCurrentStart((current) => (current === next ? current : next));
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const load = useCallback(async (requestedStart: string) => {
    setLoading(true);
    const response = await fetch(`/api/week?start=${requestedStart}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      setLoading(false);
      return;
    }
    const payload = (await response.json()) as WeekPayload;
    setStartDate(payload.startDate);
    setProjects(payload.projects);
    setBacklogTasks(payload.backlogTasks);
    setProjectPoolTasks(payload.projectPoolTasks);
    setScheduledTasks(payload.scheduledTasks);
    setExpandedProjects(
      Array.from(
        new Set(
          payload.projects
            .filter((project) => project.showInWeekPlan)
            .map((project) => project.id)
            .concat(
              payload.projectPoolTasks
            .map((task) => task.projectId)
            .filter((id): id is string => Boolean(id))
            )
        )
      )
    );
    setLoading(false);
  }, []);

  const loadCalendar = useCallback(async () => {
    const response = await fetch(`/api/dashboard?date=${todayKey()}`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const payload = (await response.json()) as CalendarPayload;
    setCalendarTasks(payload.tasks);
    setHabits(payload.habits);
    setHabitLogs(payload.habitLogs);
  }, []);

  useEffect(() => {
    void load(currentStart);
    void loadCalendar();
  }, [currentStart, load, loadCalendar]);

  // SSE 实时同步
  useEffect(() => {
    const es = new EventSource("/api/events");
    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "change") {
        void load(startDateRef.current);
        void loadCalendar();
      }
    };
    return () => es.close();
  }, [load, loadCalendar]);

  const dates = weekDateKeys(startDate);
  const taskById = useMemo(
    () =>
      new Map(
        [...backlogTasks, ...projectPoolTasks, ...scheduledTasks].map((task) => [
          task.id,
          task,
        ])
      ),
    [backlogTasks, projectPoolTasks, scheduledTasks]
  );
  const looseTasks = backlogTasks;
  const projectBacklogs = projects
    .map((project) => ({
      project,
      tasks: projectPoolTasks.filter((task) => task.projectId === project.id),
    }))
    .filter((group) => group.project.showInWeekPlan || group.tasks.length > 0);
  const poolCount = backlogTasks.length + projectPoolTasks.length;
  const availableProjects = projects.filter((project) => !project.showInWeekPlan);

  const projectIsInWeek = (task: TaskItem) =>
    Boolean(
      task.projectId &&
        projects.find((project) => project.id === task.projectId)?.showInWeekPlan
    );

  const patchTask = async (id: string, change: object) => {
    const response = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...change }),
    });
    if (!response.ok) return undefined;
    return (await response.json()) as TaskItem;
  };

  const addProjectToWeek = async (project: ProjectItem) => {
    const response = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ showInWeekPlan: true }),
    });
    if (!response.ok) return;
    setProjectPickerOpen(false);
    await load(startDate);
    setNotice(`项目“${project.name}”已加入待办事项，展开后可安排子任务`);
  };

  const addBacklogTask = async (event: FormEvent) => {
    event.preventDefault();
    if (!newTaskTitle.trim()) return;
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTaskTitle.trim(), showInWeekPlan: true }),
    });
    if (!response.ok) return;
    const created = (await response.json()) as TaskItem;
    setBacklogTasks((items) => [...items, created]);
    setNewTaskTitle("");
    setQuickAddOpen(false);
    setNotice(`“${created.title}”已加入待办事项`);
  };

  const deletePlannerTask = async (task: TaskItem) => {
    const response = await fetch("/api/tasks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: task.id }),
    });
    if (!response.ok) return;
    setBacklogTasks((items) => items.filter((item) => item.id !== task.id));
    setProjectPoolTasks((items) => items.filter((item) => item.id !== task.id));
    setScheduledTasks((items) => items.filter((item) => item.id !== task.id));
    setCalendarTasks((items) => items.filter((item) => item.id !== task.id));
    setNotice(`“${task.title}”已删除`);
  };

  const syncCalendarTask = (task: TaskItem) => {
    setCalendarTasks((items) => {
      const found = items.some((item) => item.id === task.id);
      return found
        ? items.map((item) => (item.id === task.id ? task : item))
        : [...items, task];
    });
  };

  const postOrder = async (ids: string[], scope: "default" | "scheduled") => {
    await fetch("/api/tasks/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, scope }),
    });
  };

  const toggleDone = async (id: string) => {
    const task = taskById.get(id);
    if (!task) return;
    const changed = await patchTask(id, { done: !task.done });
    if (!changed) return;
    syncCalendarTask(changed);
    setScheduledTasks((items) =>
      items.map((item) => (item.id === changed.id ? changed : item))
    );
    if (changed.done) {
      setBacklogTasks((items) => items.filter((item) => item.id !== changed.id));
      setProjectPoolTasks((items) => items.filter((item) => item.id !== changed.id));
    } else if (changed.showInWeekPlan && !changed.scheduledDate) {
      if (changed.projectId) {
        setProjectPoolTasks((items) => [...items, changed]);
      } else {
        setBacklogTasks((items) => [...items, changed]);
      }
    } else if (projectIsInWeek(changed) && !changed.scheduledDate) {
      setProjectPoolTasks((items) => [...items, changed]);
    }
  };

  const tasksForDate = (date: string) =>
    scheduledTasks
      .filter((task) => task.scheduledDate === date)
      .sort(
        (first, second) =>
          (first.todaySortOrder ?? 0) - (second.todaySortOrder ?? 0)
      );

  const moveToDate = async (task: TaskItem, date: string, beforeId?: string) => {
    const destination = tasksForDate(date).filter((item) => item.id !== task.id);
    const position = beforeId
      ? destination.findIndex((item) => item.id === beforeId)
      : -1;
    const scheduled = { ...task, scheduledDate: date };
    if (position >= 0) destination.splice(position, 0, scheduled);
    else destination.push(scheduled);
    const withOrder = destination.map((item, index) => ({
      ...item,
      todaySortOrder: index,
    }));
    setBacklogTasks((items) => items.filter((item) => item.id !== task.id));
    setProjectPoolTasks((items) => items.filter((item) => item.id !== task.id));
    setScheduledTasks((items) => [
      ...items.filter(
        (item) => item.id !== task.id && item.scheduledDate !== date
      ),
      ...withOrder,
    ]);
    const changed = await patchTask(task.id, { scheduledDate: date });
    if (changed) syncCalendarTask(changed);
    await postOrder(withOrder.map((item) => item.id), "scheduled");
    setNotice(`已将“${task.title}”安排到 ${date.slice(5)}`);
  };

  const moveToBacklog = async (task: TaskItem, beforeId?: string) => {
    const inProjectPool = Boolean(task.projectId);
    const currentPool = inProjectPool ? projectPoolTasks : backlogTasks;
    const destination = currentPool.filter((item) => item.id !== task.id);
    const position = beforeId
      ? destination.findIndex((item) => item.id === beforeId)
      : -1;
    const unscheduled = { ...task, scheduledDate: undefined };
    if (position >= 0) destination.splice(position, 0, unscheduled);
    else destination.push(unscheduled);
    setScheduledTasks((items) => items.filter((item) => item.id !== task.id));
    const updatedPool = task.done
      ? destination.filter((item) => item.id !== task.id)
      : destination;
    if (inProjectPool) {
      setProjectPoolTasks(updatedPool);
    } else {
      setBacklogTasks(updatedPool);
    }
    const shouldJoinWeek = !task.showInWeekPlan && !projectIsInWeek(task);
    const changed = await patchTask(task.id, {
      scheduledDate: null,
      ...(shouldJoinWeek ? { showInWeekPlan: true } : {}),
    });
    if (changed) syncCalendarTask(changed);
    await postOrder(destination.map((item) => item.id), "default");
    setNotice(
      shouldJoinWeek
        ? `“${task.title}”已加入本周计划并移回待办事项`
        : `“${task.title}”已移回待办事项`
    );
  };

  const reorderBacklog = async (task: TaskItem, beforeId?: string) => {
    if (!beforeId || beforeId === task.id) return;
    const inProjectPool = Boolean(task.projectId);
    const currentPool = inProjectPool ? projectPoolTasks : backlogTasks;
    const reordered = currentPool.filter((item) => item.id !== task.id);
    const position = reordered.findIndex((item) => item.id === beforeId);
    if (position < 0) return;
    reordered.splice(position, 0, task);
    if (inProjectPool) {
      setProjectPoolTasks(reordered);
    } else {
      setBacklogTasks(reordered);
    }
    await postOrder(reordered.map((item) => item.id), "default");
  };

  const completeDrop = (task: TaskItem, info: PanInfo) => {
    blockClickUntil.current = Date.now() + 450;
    const target = findDropTarget(info, task.id);
    setHoveredDate(null);
    setHoveredPool(false);
    if (!target) return false;
    if (target.type === "backlog") {
      if (task.scheduledDate) void moveToBacklog(task, target.beforeId);
      else void reorderBacklog(task, target.beforeId);
      return true;
    }
    void moveToDate(task, target.date, target.beforeId);
    return true;
  };

  const updateDropHighlight = (taskId: string, info: PanInfo) => {
    const target = findDropTarget(info, taskId);
    setHoveredDate(target?.type === "date" ? target.date : null);
    setHoveredPool(target?.type === "backlog");
  };

  return (
    <WorkspaceShell
      active="week"
      kicker="WEEK SCHEDULER"
      title="七日周计划"
      description="把已进入本周的行动分配到具体日期；临时安排的今日任务也会自然显示在对应一天。"
      action={
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load(shiftDate(startDate, -7))}
            className="rounded-full border border-white/10 p-2 text-text-secondary hover:text-text-primary"
            aria-label="上一周"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-28 text-center text-sm text-text-secondary">
            {displayWeekRange(startDate)}
          </span>
          <button
            onClick={() => void load(shiftDate(startDate, 7))}
            className="rounded-full border border-white/10 p-2 text-text-secondary hover:text-text-primary"
            aria-label="下一周"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {startDate !== currentStart && (
            <button
              onClick={() => void load(currentStart)}
              className="ml-1 flex items-center gap-1.5 rounded-full border border-accent-green/25 px-3 py-2 text-xs text-accent-green"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              本周
            </button>
          )}
        </div>
      }
    >
      <section
        onClickCapture={(event) => {
          if (Date.now() < blockClickUntil.current) {
            event.preventDefault();
            event.stopPropagation();
            blockClickUntil.current = 0;
          }
        }}
        className="flex flex-col gap-4 pb-5"
      >
        <article
          data-planner-pool="true"
          className={`order-2 rounded-[24px] border bg-card/55 p-4 transition-colors ${
            hoveredPool
              ? "border-accent-green bg-accent-green/[0.12] shadow-[0_0_0_1px_rgba(156,255,109,0.24),0_0_28px_rgba(156,255,109,0.10)]"
              : dragging
              ? "border-accent-green/25 bg-accent-green/[0.03]"
              : "border-white/[0.08]"
          }`}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] tracking-[0.24em] text-text-muted">BACKLOG</p>
              <h3 className="mt-1 font-semibold text-text-primary">待办事项</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setQuickAddOpen((open) => !open)}
                className="flex items-center gap-1.5 rounded-full border border-accent-green/25 bg-accent-green/[0.06] px-3 py-1.5 text-xs font-medium text-accent-green transition-colors hover:border-accent-green/50 hover:bg-accent-green/[0.12]"
              >
                <Plus className="h-3.5 w-3.5" />
                添加任务
              </button>
              <button
                onClick={() => setProjectPickerOpen((open) => !open)}
                className="flex items-center gap-1.5 rounded-full border border-accent-purple/25 bg-accent-purple/[0.06] px-3 py-1.5 text-xs font-medium text-accent-purple transition-colors hover:border-accent-purple/50 hover:bg-accent-purple/[0.12]"
              >
                <ListPlus className="h-3.5 w-3.5" />
                加入项目
              </button>
              <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-xs text-text-muted">
                {poolCount} 任务
              </span>
            </div>
          </div>
          {quickAddOpen && (
            <form
              onSubmit={addBacklogTask}
              className="mb-4 flex items-center gap-2 rounded-2xl border border-accent-green/25 bg-accent-green/[0.04] p-2"
            >
              <Plus className="ml-2 h-4 w-4 shrink-0 text-accent-green" />
              <input
                autoFocus
                value={newTaskTitle}
                onChange={(event) => setNewTaskTitle(event.target.value)}
                placeholder="输入待办任务，按回车保存"
                className="min-w-0 flex-1 bg-transparent py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
              />
              <button className="rounded-lg bg-accent-green px-3 py-2 text-xs font-medium text-[#10120d]">
                保存
              </button>
              <button
                type="button"
                onClick={() => {
                  setQuickAddOpen(false);
                  setNewTaskTitle("");
                }}
                className="rounded-lg p-2 text-text-muted hover:text-text-primary"
                aria-label="取消添加待办任务"
              >
                <X className="h-4 w-4" />
              </button>
            </form>
          )}
          {projectPickerOpen && (
            <div className="mb-4 rounded-2xl border border-accent-purple/20 bg-accent-purple/[0.04] p-3">
              <p className="mb-2 text-xs text-text-muted">
                项目加入后不会排到日期中；请展开项目并拖动具体子任务。
              </p>
              {availableProjects.length === 0 ? (
                <p className="rounded-xl bg-black/15 px-3 py-2 text-xs text-text-muted">
                  所有项目都已加入本周计划
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {availableProjects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => void addProjectToWeek(project)}
                      className="rounded-full border border-white/[0.08] bg-black/20 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-accent-purple/35 hover:text-text-primary"
                    >
                      + {project.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div>
            {loading ? (
              <p className="py-6 text-center text-xs text-text-muted">载入中</p>
            ) : poolCount === 0 && projectBacklogs.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 px-3 py-5 text-center text-xs leading-5 text-text-muted">
                尚无待排任务，可在项目中加入本周计划
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {looseTasks.length > 0 && (
                  <BacklogGroup title="零散任务">
                    {looseTasks.map((task) => (
                      <PlannerTaskRow
                        key={task.id}
                        task={task}
                        onToggle={toggleDone}
                        onDelete={deletePlannerTask}
                        onDrop={completeDrop}
                        onDraggingChange={setDragging}
                        onDragMove={updateDropHighlight}
                        location="backlog"
                      />
                    ))}
                  </BacklogGroup>
                )}
                {projectBacklogs.map(({ project, tasks }) => {
                  const expanded = expandedProjects.includes(project.id);
                  return (
                    <div key={project.id} className="rounded-xl border border-white/[0.06] bg-black/20">
                      <div className="flex items-center gap-1 px-2 py-1">
                        <button
                          onClick={() =>
                            setExpandedProjects((items) =>
                              expanded
                                ? items.filter((id) => id !== project.id)
                                : [...items, project.id]
                            )
                          }
                          aria-expanded={expanded}
                          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1.5 text-left text-xs text-text-secondary transition-colors hover:bg-white/[0.03] hover:text-text-primary"
                        >
                          <FolderKanban className="h-3.5 w-3.5 shrink-0 text-accent-purple" />
                          <span className="min-w-0 flex-1 truncate">{project.name}</span>
                          <span className="shrink-0 text-text-muted">{tasks.length} 待排</span>
                          <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
                        </button>
                        <Link
                          href={`/projects/${project.id}`}
                          aria-label={`进入项目页：${project.name}`}
                          className="flex shrink-0 items-center gap-1 rounded-full border border-accent-purple/20 bg-accent-purple/[0.06] px-2 py-1 text-[11px] font-medium text-accent-purple transition-colors hover:border-accent-purple/45 hover:bg-accent-purple/[0.12]"
                        >
                          进入
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </div>
                      {!expanded && (
                        <p className="px-3 pb-2 text-[10px] text-text-muted">
                          展开后拖动子任务到具体日期
                        </p>
                      )}
                      {expanded && (
                        <div className="border-t border-white/[0.06] px-2 py-1">
                          {tasks.length === 0 ? (
                            <p className="px-2 py-3 text-xs text-text-muted">
                              未完成子任务均已安排
                            </p>
                          ) : (
                            tasks.map((task) => (
                              <PlannerTaskRow
                                key={task.id}
                                task={task}
                                onToggle={toggleDone}
                                onDelete={deletePlannerTask}
                                onDrop={completeDrop}
                                onDraggingChange={setDragging}
                                onDragMove={updateDropHighlight}
                                location="backlog"
                              />
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </article>
        <div className="order-1 overflow-x-auto rounded-[24px] border border-white/[0.08] bg-card/45 p-2.5">
          <div className="grid min-w-[840px] grid-cols-7 gap-2.5">
            {dates.map((date, index) => (
              <DayColumn
                key={date}
                date={date}
                weekday={WEEKDAYS[index]}
                tasks={tasksForDate(date)}
                projects={projects}
                today={date === todayKey()}
                highlighted={date === hoveredDate}
                onToggle={toggleDone}
                onDelete={deletePlannerTask}
                onDrop={completeDrop}
                onDraggingChange={setDragging}
                onDragMove={updateDropHighlight}
              />
            ))}
          </div>
        </div>
      </section>
      {notice && (
        <p className="mt-4 rounded-full border border-accent-green/20 bg-accent-green/[0.06] px-4 py-2 text-xs text-accent-green">
          {notice}
        </p>
      )}
      <MonthCalendarDrawer
        tasks={calendarTasks}
        events={[]}
        habits={habits}
        habitLogs={habitLogs}
        recurringTasks={[]}
        focusDate={dates[3]}
        onDeleteTask={(id) => {
          const task = taskById.get(id) ?? calendarTasks.find((item) => item.id === id);
          if (task) void deletePlannerTask(task);
        }}
      />
    </WorkspaceShell>
  );
}

function BacklogGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <p className="mb-2 text-[10px] tracking-[0.2em] text-text-muted">{title}</p>
      <div className="rounded-xl border border-white/[0.06] bg-black/20 px-2 py-1">
        {children}
      </div>
    </div>
  );
}

function DayColumn({
  date,
  weekday,
  tasks,
  projects,
  today,
  highlighted,
  onToggle,
  onDelete,
  onDrop,
  onDraggingChange,
  onDragMove,
}: {
  date: string;
  weekday: string;
  tasks: TaskItem[];
  projects: ProjectItem[];
  today: boolean;
  highlighted: boolean;
  onToggle: (id: string) => void;
  onDelete: (task: TaskItem) => void;
  onDrop: (task: TaskItem, info: PanInfo) => boolean;
  onDraggingChange: (dragging: boolean) => void;
  onDragMove: (taskId: string, info: PanInfo) => void;
}) {
  return (
    <article
      data-planner-day={date}
      className={`min-h-[500px] rounded-[18px] border p-2.5 transition-all ${
        highlighted
          ? "border-accent-green bg-accent-green/[0.12] shadow-[0_0_0_1px_rgba(156,255,109,0.26),0_0_32px_rgba(156,255,109,0.12)]"
          : today
          ? "border-accent-green/35 bg-accent-green/[0.04]"
          : "border-white/[0.07] bg-black/10"
      }`}
    >
      <header className="mb-3 border-b border-white/[0.06] pb-2">
        <p className={`text-xs font-medium ${today ? "text-accent-green" : "text-text-secondary"}`}>
          {weekday}
        </p>
        <p className="mt-1 text-sm font-semibold tabular-nums text-text-primary">{date.slice(5)}</p>
      </header>
      <div className="grid content-start gap-1.5">
        {tasks.length === 0 && (
          <p className="col-span-full rounded-xl border border-dashed border-white/[0.08] px-3 py-4 text-center text-[11px] text-text-muted">
            拖到这里安排
          </p>
        )}
        {tasks.map((task) => (
          <PlannerTaskRow
            key={task.id}
            task={task}
            project={projects.find((project) => project.id === task.projectId)}
            onToggle={onToggle}
            onDelete={onDelete}
            onDrop={onDrop}
            onDraggingChange={onDraggingChange}
            onDragMove={onDragMove}
            location={date}
          />
        ))}
      </div>
    </article>
  );
}

type DropTarget =
  | { type: "backlog"; beforeId?: string }
  | { type: "date"; date: string; beforeId?: string };

function findDropTarget(info: PanInfo, draggedId: string): DropTarget | null {
  const point = info.point;
  const areas = Array.from(
    document.querySelectorAll<HTMLElement>("[data-planner-pool], [data-planner-day]")
  );
  const draggedRow = Array.from(
    document.querySelectorAll<HTMLElement>("[data-planner-task-id]")
  ).find((element) => element.dataset.plannerTaskId === draggedId);
  const draggedBounds = draggedRow?.getBoundingClientRect();
  const sourceLocation = draggedRow?.dataset.plannerLocation;
  const isSourceArea = (element: HTMLElement) =>
    sourceLocation === "backlog"
      ? Boolean(element.dataset.plannerPool)
      : element.dataset.plannerDay === sourceLocation;
  const pointedArea = areas.find((element) => {
    const bounds = element.getBoundingClientRect();
    return (
      point.x >= bounds.left &&
      point.x <= bounds.right &&
      point.y >= bounds.top &&
      point.y <= bounds.bottom
    );
  });
  const overlapMatches = draggedBounds
    ? areas
        .map((element) => {
          const bounds = element.getBoundingClientRect();
          const width =
            Math.min(bounds.right, draggedBounds.right) -
            Math.max(bounds.left, draggedBounds.left);
          const height =
            Math.min(bounds.bottom, draggedBounds.bottom) -
            Math.max(bounds.top, draggedBounds.top);
          return { element, overlap: Math.max(0, width) * Math.max(0, height) };
        })
        .filter((match) => match.overlap > 0)
        .sort((first, second) => second.overlap - first.overlap)
    : [];
  const destinationOverlap = overlapMatches.find(
    (match) => !isSourceArea(match.element)
  )?.element;
  const area =
    (pointedArea && !isSourceArea(pointedArea) ? pointedArea : undefined) ??
    destinationOverlap ??
    pointedArea ??
    overlapMatches[0]?.element;
  if (!area) return null;
  const rows = Array.from(area.querySelectorAll<HTMLElement>("[data-planner-task-id]"));
  const nearest = rows.reduce<{ id: string; distance: number } | undefined>(
    (current, row) => {
      const id = row.dataset.plannerTaskId;
      if (!id || id === draggedId) return current;
      const bounds = row.getBoundingClientRect();
      const distance = Math.abs(point.y - (bounds.top + bounds.height / 2));
      return !current || distance < current.distance ? { id, distance } : current;
    },
    undefined
  );
  if (area.dataset.plannerPool) {
    return { type: "backlog", beforeId: nearest?.id };
  }
  return { type: "date", date: area.dataset.plannerDay!, beforeId: nearest?.id };
}

function PlannerTaskRow({
  task,
  project,
  onToggle,
  onDelete,
  onDrop,
  onDraggingChange,
  onDragMove,
  location,
}: {
  task: TaskItem;
  project?: ProjectItem;
  onToggle: (id: string) => void;
  onDelete: (task: TaskItem) => void;
  onDrop: (task: TaskItem, info: PanInfo) => boolean;
  onDraggingChange: (dragging: boolean) => void;
  onDragMove: (taskId: string, info: PanInfo) => void;
  location: string;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const suppressClick = useRef(false);

  return (
    <div className="group relative mb-1.5">
      <motion.button
        data-planner-task-id={task.id}
        data-planner-location={location}
        drag
        dragMomentum={false}
        dragElastic={0.08}
        style={{ x, y }}
        onDragStart={() => {
          suppressClick.current = true;
          onDraggingChange(true);
        }}
        onDrag={(_, info) => onDragMove(task.id, info)}
        onDragEnd={(_, info) => {
          onDraggingChange(false);
          if (onDrop(task, info)) {
            x.set(0);
            y.set(0);
          } else {
            animate(x, 0, { type: "spring", stiffness: 420, damping: 34 });
            animate(y, 0, { type: "spring", stiffness: 420, damping: 34 });
          }
        }}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          onToggle(task.id);
        }}
        whileDrag={{ scale: 1.025, backgroundColor: "rgba(156, 255, 109, 0.08)" }}
        className={`flex w-full cursor-grab touch-none select-none items-start gap-1.5 rounded-lg border border-white/[0.05] bg-black/20 px-2 py-2 pr-8 text-left text-xs active:cursor-grabbing ${
          task.done ? "opacity-50" : ""
        }`}
      >
        <GripVertical className="pointer-events-none mt-0.5 h-3 w-3 shrink-0 text-text-muted" />
        {task.done ? (
          <CheckCircle2 className="pointer-events-none mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-green" />
        ) : (
          <Circle className="pointer-events-none mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" />
        )}
        <span className="pointer-events-none min-w-0 flex-1">
          <span className={`block leading-4 ${task.done ? "line-through text-text-muted" : "text-text-secondary"}`}>
            {task.title}
          </span>
          {project && (
            <span className="mt-1 block truncate rounded bg-accent-purple/10 px-1.5 py-0.5 text-[9px] text-accent-purple">
              {project.name}
            </span>
          )}
        </span>
      </motion.button>
      <button
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onDelete(task);
        }}
        aria-label={`删除任务：${task.title}`}
        className="absolute right-1.5 top-1.5 rounded-md p-1 text-text-muted opacity-0 transition-all hover:bg-red-400/10 hover:text-red-400 group-hover:opacity-100 focus:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
