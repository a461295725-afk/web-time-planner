"use client";

import { ProjectItem, TaskItem } from "@/lib/mock-data";
import { FormEvent, useEffect, useRef, useState } from "react";
import { animate, motion, PanInfo, useMotionValue } from "framer-motion";
import { CheckCircle2, Circle, GripVertical, MoveDown, Plus, Trash2, X } from "lucide-react";

interface Props {
  tasks: TaskItem[];
  projects?: ProjectItem[];
  onToggle: (id: string) => void;
  onDelete?: (id: string) => void;
  onPostpone?: (id: string) => void;
  isDragTargetActive?: boolean;
  recentlyScheduledIds?: string[];
  quickAddOpen?: boolean;
  onQuickAdd?: (title: string) => void;
  onCancelQuickAdd?: () => void;
  onReorder?: (draggedId: string, targetId: string) => void;
}

const priorityBadge = (p: TaskItem["priority"]) => {
  const colors: Record<string, string> = {
    P1: "bg-accent-green/15 text-accent-green border-accent-green/20",
    P2: "bg-accent-purple/15 text-accent-purple border-accent-purple/20",
    P3: "bg-text-muted/15 text-text-muted border-text-muted/15",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${colors[p]}`}>
      {p}
    </span>
  );
};

export default function TodaySection({
  tasks,
  projects = [],
  onToggle,
  onDelete,
  onPostpone,
  isDragTargetActive = false,
  recentlyScheduledIds = [],
  quickAddOpen = false,
  onQuickAdd,
  onCancelQuickAdd,
  onReorder,
}: Props) {
  const projectName = (task: TaskItem) =>
    projects.find((project) => project.id === task.projectId)?.name;
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (quickAddOpen) inputRef.current?.focus();
  }, [quickAddOpen]);

  const submitTask = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !onQuickAdd) return;
    onQuickAdd(title.trim());
    setTitle("");
  };

  return (
    <section
      data-drop-zone="today"
      className={`rounded-2xl border bg-black/40 p-4 transition-all duration-300 sm:p-5 lg:min-h-[284px] ${
        isDragTargetActive
          ? "border-accent-green/60 bg-accent-green/[0.06] shadow-[0_0_32px_rgba(156,255,109,0.14),inset_0_0_0_1px_rgba(156,255,109,0.15)]"
          : "border-white/[0.07] hover:border-white/[0.10]"
      }`}
    >
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
            行动 / 今日
          </p>
          <h2 className="text-lg font-semibold tracking-tight text-text-primary sm:text-xl">
            今日要事
          </h2>
        </div>
        {isDragTargetActive ? (
          <span className="flex animate-pulse items-center gap-1.5 rounded-full border border-accent-green/40 bg-accent-green/10 px-3 py-2 text-xs font-medium text-accent-green">
            <MoveDown className="h-3.5 w-3.5" />
            放入今日
          </span>
        ) : (
          <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-[11px] text-text-muted">
            {tasks.length} 项
          </span>
        )}
      </div>

      {isDragTargetActive && (
        <div className="mb-3 rounded-xl border border-dashed border-accent-green/40 bg-accent-green/[0.04] py-3 text-center text-xs font-medium text-accent-green">
          放开以安排到今天 · 项目会加入全部未完成子任务
        </div>
      )}

      {quickAddOpen && (
        <form
          onSubmit={submitTask}
          className="mb-4 flex items-center gap-2 rounded-xl border border-accent-green/30 bg-accent-green/[0.05] p-2"
        >
          <Plus className="ml-2 h-4 w-4 shrink-0 text-accent-green" />
          <input
            ref={inputRef}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="输入今日任务，按回车保存"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
          />
          <button className="rounded-lg bg-accent-green px-3 py-2 text-xs font-medium text-[#10120d] hover:brightness-110">
            加入今日
          </button>
          <button
            type="button"
            aria-label="取消新增"
            onClick={() => {
              setTitle("");
              onCancelQuickAdd?.();
            }}
            className="rounded-lg p-2 text-text-muted hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </form>
      )}

      <div data-today-sort-list="open" className="divide-y divide-white/[0.05]">
        {tasks.map((task) => {
          const isDone = task.done;
          const isNew = recentlyScheduledIds.includes(task.id);
          return (
            <TodayTaskRow
              key={task.id}
              task={task}
              onToggle={onToggle}
              onDelete={onDelete}
              onPostpone={onPostpone}
              onReorder={onReorder}
              className={`flex w-full items-center gap-3 text-left text-sm transition-colors sm:text-[15px] pr-20 ${
                isNew
                  ? "rounded-lg bg-accent-green/[0.08] px-2 text-accent-green py-3"
                  : isDone
                    ? "py-2.5 opacity-50"
                    : "py-3 text-text-secondary hover:text-text-primary"
              }`}
            >
              <GripVertical className={`pointer-events-none h-3.5 w-3.5 shrink-0 ${isDone ? "text-text-muted/40" : "text-text-muted/60"}`} />
              {isDone ? (
                <CheckCircle2 className="pointer-events-none h-4 w-4 shrink-0 text-accent-green" />
              ) : (
                <Circle className="pointer-events-none h-4 w-4 shrink-0 text-text-muted sm:h-4.5" />
              )}
              <span className={`pointer-events-none min-w-0 flex-1 ${isDone ? "text-text-muted line-through" : ""}`}>
                {task.title}
              </span>
              <span className="pointer-events-none shrink-0">
                {priorityBadge(task.priority)}
              </span>
              {task.projectId && (
                <span className="pointer-events-none hidden shrink-0 truncate rounded-full border border-accent-purple/15 bg-accent-purple/[0.06] px-2 py-0.5 text-[10px] text-accent-purple sm:block sm:max-w-[100px]">
                  {projectName(task)}
                </span>
              )}
              {isNew && (
                <span className="pointer-events-none shrink-0 text-[10px] text-accent-green">
                  刚刚安排
                </span>
              )}
            </TodayTaskRow>
          );
        })}
      </div>
    </section>
  );
}

function TodayTaskRow({
  task,
  onToggle,
  onDelete,
  onPostpone,
  onReorder,
  className,
  children,
}: {
  task: TaskItem;
  onToggle: (id: string) => void;
  onDelete?: (id: string) => void;
  onPostpone?: (id: string) => void;
  onReorder?: (draggedId: string, targetId: string) => void;
  className: string;
  children: React.ReactNode;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const suppressNextClick = useRef(false);

  const targetAt = (info: PanInfo) => {
    const list = Array.from(
      document.querySelectorAll<HTMLElement>("[data-today-sort-list]")
    ).find((element) => {
      const bounds = element.getBoundingClientRect();
      const rows = Array.from(
        element.querySelectorAll<HTMLElement>("[data-today-sort-id]")
      );
      return (
        bounds.width > 0 &&
        bounds.height > 0 &&
        rows.some((row) => row.dataset.todaySortId === task.id)
      );
    });
    if (!list) return null;
    const bounds = list.getBoundingClientRect();
    if (
      info.point.x < bounds.left - 24 ||
      info.point.x > bounds.right + 24 ||
      info.point.y < bounds.top - 24 ||
      info.point.y > bounds.bottom + 24
    ) {
      return null;
    }
    return Array.from(
      list.querySelectorAll<HTMLElement>("[data-today-sort-id]")
    ).reduce<{ id: string; distance: number } | null>((nearest, row) => {
      const id = row.dataset.todaySortId;
      if (!id || id === task.id) return nearest;
      const rowBounds = row.getBoundingClientRect();
      const distance = Math.abs(info.point.y - (rowBounds.top + rowBounds.height / 2));
      return !nearest || distance < nearest.distance ? { id, distance } : nearest;
    }, null)?.id ?? task.id;
  };

  return (
    <div className="group relative">
      <motion.button
        data-today-sort-id={task.id}
        drag={Boolean(onReorder)}
        dragMomentum={false}
        dragElastic={0.06}
        style={{ x, y }}
        whileTap={{ scale: 0.99 }}
        whileDrag={{
          scale: 1.02,
          backgroundColor: "rgba(156, 255, 109, 0.06)",
          borderRadius: 12,
          zIndex: 10,
        }}
        onDragEnd={(_, info) => {
          const dragDistance = Math.hypot(info.offset.x, info.offset.y);
          const wasDragGesture = dragDistance > 6;
          suppressNextClick.current = wasDragGesture;
          const targetId = targetAt(info);
          if (wasDragGesture && targetId && targetId !== task.id) onReorder?.(task.id, targetId);
          animate(x, 0, { type: "spring", stiffness: 420, damping: 34 });
          animate(y, 0, { type: "spring", stiffness: 420, damping: 34 });
        }}
        onClick={() => {
          if (suppressNextClick.current) {
            suppressNextClick.current = false;
            return;
          }
          onToggle(task.id);
        }}
        className={`${className} cursor-grab select-none touch-none active:cursor-grabbing`}
      >
        {children}
      </motion.button>
      {onPostpone && !task.done && (
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onPostpone(task.id);
          }}
          aria-label={`推迟任务：${task.title}`}
          className="absolute right-10 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-text-muted opacity-0 transition-all hover:bg-amber-400/10 hover:text-amber-400 group-hover:opacity-100 focus:opacity-100"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onDelete(task.id);
          }}
          aria-label={`删除任务：${task.title}`}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-text-muted opacity-0 transition-all hover:bg-red-400/10 hover:text-red-400 group-hover:opacity-100 focus:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function ActiveTaskNotebook({
  tasks,
  onSaveNote,
}: {
  tasks: TaskItem[];
  onSaveNote?: (taskId: string, description: string) => void;
}) {
  const focusTask = tasks.find((task) => !task.done) ?? tasks[0];
  const [note, setNote] = useState("");

  useEffect(() => {
    setNote(focusTask?.description ?? "");
  }, [focusTask?.id, focusTask?.description]);

  if (!focusTask) return null;

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-black/25 p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
            笔记 / 跟踪
          </p>
          <h2 className="text-base font-semibold tracking-tight text-text-primary sm:text-lg">
            活跃任务笔记
          </h2>
        </div>
        <span className="rounded-full border border-accent-green/20 bg-accent-green/[0.06] px-3 py-1 text-[11px] text-accent-green">
          进行中
        </span>
      </div>
      <div className="rounded-xl border border-white/[0.06] bg-black/30 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-accent-purple/20 bg-accent-purple/[0.06] px-2.5 py-1 text-[11px] text-accent-purple">
            {new Date().toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}
          </span>
          <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 text-[11px] text-text-secondary">
            今日优先
          </span>
          <span className="rounded-full border border-accent-green/20 bg-accent-green/[0.06] px-2.5 py-1 text-[11px] text-accent-green">
            P1
          </span>
        </div>
        <p className="mb-3 text-[15px] font-medium text-text-primary">{focusTask.title}</p>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="记录这个任务的想法、资料或结论..."
          className="min-h-24 w-full resize-y rounded-xl border border-white/[0.06] bg-black/25 p-3 text-sm leading-6 text-text-secondary outline-none placeholder:text-text-muted transition-colors focus:border-accent-green/25"
        />
        {onSaveNote && (
          <button
            onClick={() => onSaveNote(focusTask.id, note)}
            className="mt-3 rounded-full border border-accent-green/25 bg-accent-green/[0.06] px-3 py-1.5 text-xs font-medium text-accent-green transition-colors hover:border-accent-green/45"
          >
            保存备注
          </button>
        )}
      </div>
    </section>
  );
}
