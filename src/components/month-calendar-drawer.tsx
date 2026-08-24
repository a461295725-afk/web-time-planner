"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ListChecks,
  Plus,
  Repeat,
  Trash2,
  X,
} from "lucide-react";
import {
  CalendarEventItem,
  HabitItem,
  HabitLogItem,
  TaskItem,
} from "@/lib/mock-data";
import { RecurringTask } from "@/lib/server-store";
import { filterDateItemsForMonth, todayKey } from "@/lib/date";

interface Props {
  tasks: TaskItem[];
  events: CalendarEventItem[];
  habits: HabitItem[];
  habitLogs: HabitLogItem[];
  recurringTasks: RecurringTask[];
  focusDate?: string;
  onDeleteTask?: (id: string) => void;
  onAddTask?: (date: string, title: string) => Promise<void>;
  onAddRecurring?: (title: string, dayOfMonth: number) => void;
  onDeleteRecurring?: (id: string) => void;
}

interface CalendarDay {
  date: string;
  day: number;
  isToday: boolean;
}

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
function shiftMonth(monthKey: string, offset: number): string {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7)) - 1 + offset;
  const date = new Date(Date.UTC(year, month, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function MonthCalendarDrawer({
  tasks,
  events,
  habits,
  habitLogs,
  recurringTasks,
  focusDate,
  onDeleteTask,
  onAddTask,
  onAddRecurring,
  onDeleteRecurring,
}: Props) {
  const [open, setOpen] = useState(false);
  const [today, setToday] = useState(todayKey);
  const [viewMonth, setViewMonth] = useState(
    (focusDate ?? todayKey()).slice(0, 7)
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = todayKey();
      setToday((current) => (current === next ? current : next));
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (focusDate) {
      setViewMonth(focusDate.slice(0, 7));
      setSelectedDate(null);
    }
  }, [focusDate]);
  const viewDate = new Date(`${viewMonth}-01T00:00:00+08:00`);
  const daysInMonth = new Date(
    viewDate.getFullYear(),
    viewDate.getMonth() + 1,
    0
  ).getDate();
  const monthLabel = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "long",
  }).format(viewDate);
  const days: CalendarDay[] = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = `${viewMonth}-${String(day).padStart(2, "0")}`;
    return { day, date, isToday: date === today };
  });
  const startPad = (viewDate.getDay() + 6) % 7;
  const padded = [...Array<CalendarDay | null>(startPad).fill(null), ...days];
  const scheduledTasks = tasks.filter((task) => task.scheduledDate?.startsWith(viewMonth));
  const monthEvents = events.filter((event) => event.date.startsWith(viewMonth));
  const liveHabitLogs = [
    ...filterDateItemsForMonth(habitLogs, viewMonth).filter((log) => log.date !== today),
    ...habits
      .filter((habit) => habit.checked && viewMonth === today.slice(0, 7))
      .map((habit) => ({ habitId: habit.id, date: today })),
  ];

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        aria-label={open ? "关闭月度日历" : "打开月度日历"}
        className="fixed right-0 top-1/2 z-40 flex h-20 w-9 -translate-y-1/2 items-center justify-center rounded-l-2xl border border-r-0 border-white/10 bg-card/95 shadow-[-8px_0_28px_rgba(0,0,0,0.2)] transition-colors hover:border-accent-green/40"
      >
        <ChevronLeft
          className={`h-4 w-4 text-accent-green transition-transform duration-300 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
            />

            <motion.section
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 210 }}
              aria-label="月度日历面板"
              className="fixed inset-2 z-50 flex flex-col overflow-hidden rounded-[26px] border border-white/10 bg-bg-secondary shadow-[-16px_0_56px_rgba(0,0,0,0.4)] sm:inset-4 lg:inset-6"
            >
              <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.07] px-4 py-4 sm:px-6 lg:px-8">
                <div className="flex items-center gap-4">
                  <div className="rounded-2xl border border-accent-green/20 bg-accent-green/10 p-3 text-accent-green">
                    <CalendarDays className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-medium tracking-[0.24em] text-text-muted">
                      MONTH PLANNER
                    </p>
                    <h2 className="text-xl font-semibold text-text-primary sm:text-2xl">
                      {monthLabel}
                    </h2>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="hidden gap-4 rounded-full border border-card-border bg-card/55 px-4 py-2 text-xs text-text-secondary sm:flex">
                    <span>{scheduledTasks.length} 项任务</span>
                    <span>{monthEvents.length} 场日程</span>
                  </div>
                  <button
                    onClick={() => {
                      setViewMonth((month) => shiftMonth(month, -1));
                      setSelectedDate(null);
                    }}
                    aria-label="上个月"
                    className="rounded-xl border border-card-border p-2 text-text-secondary transition-colors hover:text-text-primary"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      setViewMonth((month) => shiftMonth(month, 1));
                      setSelectedDate(null);
                    }}
                    aria-label="下个月"
                    className="rounded-xl border border-card-border p-2 text-text-secondary transition-colors hover:text-text-primary"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    aria-label="关闭日历"
                    className="ml-2 rounded-xl border border-card-border p-2 text-text-secondary transition-colors hover:text-text-primary"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </header>

              <div className="flex-1 overflow-auto px-3 pb-14 pt-3 sm:px-5 sm:pb-16 sm:pt-5 lg:px-6 lg:pb-20 lg:pt-6">
                <div className="min-w-[790px]">
                  <div className="mb-2 grid grid-cols-7 gap-2 lg:gap-3">
                    {WEEKDAYS.map((weekday) => (
                      <div
                        key={weekday}
                        className="px-3 py-2 text-xs font-semibold text-text-muted"
                      >
                        {weekday}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-2 lg:gap-3">
                    {padded.map((day, index) => (
                      <CalendarCell
                        key={day?.date ?? `empty-${index}`}
                        day={day}
                        tasks={day ? scheduledTasks.filter((task) => task.scheduledDate === day.date) : []}
                        events={day ? monthEvents.filter((event) => event.date === day.date) : []}
                        recurringTasks={day ? recurringTasks.filter((rt) => rt.dayOfMonth === day.day) : []}
                        onShowAll={day ? () => setSelectedDate(day.date) : undefined}
                        onDeleteTask={onDeleteTask}
                      />
                    ))}
                  </div>
                  <HabitMonthGrid
                    habits={habits}
                    logs={liveHabitLogs}
                    viewMonth={viewMonth}
                    daysInMonth={daysInMonth}
                    today={today}
                  />
                  <RecurringTasksSection
                    recurringTasks={recurringTasks}
                    onAdd={onAddRecurring}
                    onDelete={onDeleteRecurring}
                  />
                </div>
              </div>
              <AnimatePresence>
                {selectedDate && (
                  <CalendarDayDetails
                    date={selectedDate}
                    tasks={scheduledTasks.filter((task) => task.scheduledDate === selectedDate)}
                    events={monthEvents.filter((event) => event.date === selectedDate)}
                    onClose={() => setSelectedDate(null)}
                    onDeleteTask={onDeleteTask}
                    onAddTask={onAddTask}
                  />
                )}
              </AnimatePresence>
            </motion.section>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function HabitMonthGrid({
  habits,
  logs,
  viewMonth,
  daysInMonth,
  today,
}: {
  habits: HabitItem[];
  logs: HabitLogItem[];
  viewMonth: string;
  daysInMonth: number;
  today: string;
}) {
  const dayNumbers = Array.from({ length: daysInMonth }, (_, index) => index + 1);
  const todayNumber =
    viewMonth === today.slice(0, 7) ? Number(today.slice(-2)) : undefined;

  return (
    <section className="mt-6 rounded-[22px] border border-white/[0.08] bg-card/35 p-4 lg:p-5">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="mb-1 text-[10px] font-medium tracking-[0.24em] text-text-muted">
            HABIT TRACKER
          </p>
          <h3 className="text-lg font-semibold text-text-primary">本月打卡追踪</h3>
        </div>
        <p className="text-xs text-text-muted">纵向习惯 / 横向日期</p>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[940px]">
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `118px repeat(${daysInMonth}, minmax(24px, 1fr))` }}
          >
            <div className="px-2 py-2 text-[11px] text-text-muted">打卡项目</div>
            {dayNumbers.map((day) => (
              <div
                key={day}
                className={`flex h-8 items-center justify-center rounded-lg text-[10px] ${
                  day === todayNumber
                    ? "bg-accent-green/10 font-semibold text-accent-green"
                    : "text-text-muted"
                }`}
              >
                {day}
              </div>
            ))}
            {habits.map((habit) => {
              const completedDays = new Set(
                filterDateItemsForMonth(logs, viewMonth)
                  .filter((log) => log.habitId === habit.id)
                  .map((log) => Number(log.date.slice(-2)))
              );
              return (
                <HabitRow
                  key={habit.id}
                  habit={habit}
                  dayNumbers={dayNumbers}
                  completedDays={completedDays}
                  viewMonth={viewMonth}
                  todayNumber={todayNumber}
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function HabitRow({
  habit,
  dayNumbers,
  completedDays,
  viewMonth,
  todayNumber,
}: {
  habit: HabitItem;
  dayNumbers: number[];
  completedDays: Set<number>;
  viewMonth: string;
  todayNumber?: number;
}) {
  return (
    <>
      <div className="flex h-8 items-center px-2 text-sm text-text-secondary">
        {habit.name}
      </div>
      {dayNumbers.map((day) => {
        const complete = completedDays.has(day);
        return (
          <div
            key={day}
            title={`${habit.name} - ${viewMonth}-${String(day).padStart(2, "0")}${complete ? " 已完成" : " 未打卡"}`}
            className={`flex h-8 items-center justify-center rounded-lg border transition-colors ${
              complete
                ? "border-accent-green/25 bg-accent-green/12 text-accent-green"
                : day === todayNumber
                  ? "border-accent-green/15 bg-accent-green/[0.03]"
                  : "border-white/[0.04] bg-black/15"
            }`}
          >
            {complete && <Check className="h-3 w-3" />}
          </div>
        );
      })}
    </>
  );
}

function CalendarCell({
  day,
  tasks,
  events,
  recurringTasks,
  onShowAll,
  onDeleteTask,
}: {
  day: CalendarDay | null;
  tasks: TaskItem[];
  events: CalendarEventItem[];
  recurringTasks: RecurringTask[];
  onShowAll?: () => void;
  onDeleteTask?: (id: string) => void;
}) {
  if (!day) {
    return <div className="min-h-[116px] rounded-2xl border border-transparent lg:min-h-[138px]" />;
  }

  const entries = [
    ...events.map((event) => ({
      id: event.id,
      title: event.title,
      detail: event.time,
      type: "event" as const,
    })),
    ...tasks.map((task) => ({
      id: task.id,
      title: task.title,
      detail: task.done ? "已完成" : task.priority,
      type: "task" as const,
    })),
    ...recurringTasks.map((rt) => ({
      id: rt.id,
      title: rt.title,
      detail: "每月",
      type: "recurring" as const,
    })),
  ];

  return (
    <div
      className={`min-h-[116px] rounded-2xl border p-2.5 transition-colors lg:min-h-[138px] lg:p-3 ${
        day.isToday
          ? "border-accent-green/45 bg-accent-green/[0.04]"
          : "border-white/[0.07] bg-card/45 hover:border-white/15"
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium ${
            day.isToday ? "bg-accent-green text-[#10120d]" : "text-text-secondary"
          }`}
        >
          {day.day}
        </span>
        {entries.length > 0 && (
          <span className="text-[10px] text-text-muted">{entries.length} 项</span>
        )}
      </div>
      <div className="space-y-1.5">
        {entries.slice(0, 3).map((entry) => (
          <div
            key={entry.id}
            className={`group flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] ${
              entry.type === "event"
                ? "bg-accent-purple/10 text-accent-purple"
                : entry.type === "recurring"
                ? "bg-amber-400/10 text-amber-400"
                : "bg-accent-green/10 text-accent-green"
            }`}
          >
            {entry.type === "event" ? (
              <Clock3 className="h-3 w-3 shrink-0" />
            ) : entry.type === "recurring" ? (
              <Repeat className="h-3 w-3 shrink-0" />
            ) : (
              <ListChecks className="h-3 w-3 shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate">{entry.title}</span>
            <span className="shrink-0 opacity-70">{entry.detail}</span>
            {entry.type === "task" && onDeleteTask && (
              <button
                type="button"
                onClick={() => onDeleteTask(entry.id)}
                aria-label={`删除任务：${entry.title}`}
                className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100 focus:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        {entries.length > 3 && (
          <button
            onClick={onShowAll}
            className="w-full rounded-lg px-2 py-1 text-left text-[10px] text-accent-purple transition-colors hover:bg-accent-purple/10 hover:text-text-primary"
          >
            +{entries.length - 3} 项更多，点击查看
          </button>
        )}
      </div>
    </div>
  );
}

function CalendarDayDetails({
  date,
  tasks,
  events,
  onClose,
  onDeleteTask,
  onAddTask,
}: {
  date: string;
  tasks: TaskItem[];
  events: CalendarEventItem[];
  onClose: () => void;
  onDeleteTask?: (id: string) => void;
  onAddTask?: (date: string, title: string) => Promise<void>;
}) {
  const [quickTitle, setQuickTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const submitQuickAdd = async (event: FormEvent) => {
    event.preventDefault();
    if (!quickTitle.trim() || !onAddTask) return;
    await onAddTask(date, quickTitle.trim());
    setQuickTitle("");
    inputRef.current?.focus();
  };

  const label = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(`${date}T00:00:00+08:00`));

  return (
    <>
      <motion.button
        type="button"
        aria-label="关闭日期详情"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 z-10 bg-black/55 backdrop-blur-[2px]"
      />
      <motion.aside
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        className="absolute bottom-4 left-1/2 z-20 flex max-h-[min(70vh,580px)] w-[min(92%,520px)] -translate-x-1/2 flex-col overflow-hidden rounded-[22px] border border-card-border bg-bg-secondary shadow-[0_18px_60px_rgba(0,0,0,0.55)] sm:bottom-8"
      >
        <header className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3.5">
          <div>
            <p className="text-[10px] tracking-[0.22em] text-text-muted">DAY DETAILS</p>
            <h3 className="mt-1 text-base font-semibold text-text-primary">{label}</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭当天安排"
            className="rounded-lg border border-card-border p-2 text-text-secondary hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="overflow-y-auto p-4">
          {events.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-[10px] tracking-[0.2em] text-text-muted">日程</p>
              <div className="space-y-2">
                {events.map((event) => (
                  <div key={event.id} className="flex items-center gap-2 rounded-xl bg-accent-purple/10 px-3 py-2.5 text-sm text-accent-purple">
                    <Clock3 className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1">{event.title}</span>
                    <span className="shrink-0 text-xs opacity-75">{event.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="mb-2 text-[10px] tracking-[0.2em] text-text-muted">任务</p>
          {tasks.length === 0 && !onAddTask ? (
            <p className="rounded-xl border border-dashed border-white/[0.08] px-3 py-4 text-center text-xs text-text-muted">
              当天没有任务
            </p>
          ) : tasks.length === 0 ? null : (
            <div className="space-y-2">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="group flex items-center gap-2 rounded-xl bg-accent-green/10 px-3 py-2.5 text-sm text-accent-green"
                >
                  <ListChecks className="h-3.5 w-3.5 shrink-0" />
                  <span className={`min-w-0 flex-1 ${task.done ? "line-through opacity-60" : ""}`}>
                    {task.title}
                  </span>
                  <span className="shrink-0 text-xs opacity-75">
                    {task.done ? "已完成" : task.priority}
                  </span>
                  {onDeleteTask && (
                    <button
                      type="button"
                      onClick={() => onDeleteTask(task.id)}
                      aria-label={`删除任务：${task.title}`}
                      className="rounded-md p-1 text-text-muted opacity-0 transition-all hover:bg-red-400/10 hover:text-red-400 group-hover:opacity-100 focus:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {onAddTask && (
            <form onSubmit={submitQuickAdd} className="mt-4 flex gap-2">
              <input
                ref={inputRef}
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                placeholder="快速添加任务到这一天"
                className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-sm outline-none placeholder:text-text-muted"
              />
              <button
                type="submit"
                disabled={!quickTitle.trim()}
                className="shrink-0 rounded-xl bg-accent-green/10 px-3 text-accent-green disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
              </button>
            </form>
          )}
        </div>
      </motion.aside>
    </>
  );
}

function RecurringTasksSection({
  recurringTasks,
  onAdd,
  onDelete,
}: {
  recurringTasks: RecurringTask[];
  onAdd?: (title: string, dayOfMonth: number) => void;
  onDelete?: (id: string) => void;
}) {
  const [addTitle, setAddTitle] = useState("");
  const [addDay, setAddDay] = useState(1);

  if (!onAdd && !onDelete) return null;
  if (recurringTasks.length === 0 && !onAdd) return null;

  return (
    <section className="mt-6 rounded-[22px] border border-white/[0.08] bg-card/35 p-4 lg:p-5">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="mb-1 text-[10px] font-medium tracking-[0.24em] text-text-muted">
            MONTHLY REPEAT
          </p>
          <h3 className="text-lg font-semibold text-text-primary">每月固定任务</h3>
        </div>
        <p className="text-xs text-text-muted">每个月的同一天自动显示</p>
      </div>

      {recurringTasks.length > 0 ? (
        <div className="mb-4 space-y-1.5">
          {recurringTasks.map((rt) => (
            <div
              key={rt.id}
              className="group flex items-center gap-2 rounded-xl bg-amber-400/8 px-3 py-2.5 text-sm text-amber-400"
            >
              <Repeat className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1">{rt.title}</span>
              <span className="shrink-0 rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px]">
                每月{rt.dayOfMonth}日
              </span>
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(rt.id)}
                  aria-label={`删除固定任务：${rt.title}`}
                  className="shrink-0 rounded-md p-1 text-text-muted opacity-0 transition-all hover:bg-red-400/10 hover:text-red-400 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="mb-4 rounded-xl border border-dashed border-white/[0.08] px-3 py-4 text-center text-xs text-text-muted">
          还没有每月固定任务，如"还信用卡"、"交房租"
        </p>
      )}

      {onAdd && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={addTitle}
            onChange={(e) => setAddTitle(e.target.value)}
            placeholder="任务名称，如：还信用卡"
            className="flex-1 rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-text-primary outline-none"
          />
          <span className="text-xs text-text-muted">每月</span>
          <input
            type="number"
            min={1}
            max={31}
            value={addDay}
            onChange={(e) => setAddDay(Number(e.target.value) || 1)}
            className="w-16 rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-text-primary outline-none"
          />
          <span className="text-xs text-text-muted">日</span>
          <button
            onClick={() => {
              if (addTitle.trim()) {
                onAdd(addTitle.trim(), addDay);
                setAddTitle("");
                setAddDay(1);
              }
            }}
            disabled={!addTitle.trim()}
            className="shrink-0 rounded-full border border-amber-400/25 bg-amber-400/10 px-4 py-2.5 text-xs text-amber-400 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </section>
  );
}
