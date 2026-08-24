"use client";

import { ReactNode, useRef, useState } from "react";
import Link from "next/link";
import { ProjectItem, TaskItem } from "@/lib/mock-data";
import {
  animate,
  AnimatePresence,
  motion,
  PanInfo,
  useMotionValue,
} from "framer-motion";
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  FolderKanban,
  GripVertical,
  CalendarDays,
  ArrowRight,
  Sparkles,
  Trash2,
} from "lucide-react";

interface Props {
  tasks: TaskItem[];
  projects: ProjectItem[];
  projectTasks: TaskItem[];
  onToggleTask: (id: string) => void;
  onDeleteTask?: (id: string) => void;
  onScheduleTask: (taskId: string) => void;
  onScheduleProject: (projectId: string) => void;
  onReorderTask: (draggedId: string, targetId: string) => void;
  onDraggingChange: (dragging: boolean) => void;
  onOpenProject?: (projectId: string) => void;
}

export default function WeekSection({
  tasks,
  projects,
  projectTasks,
  onToggleTask,
  onDeleteTask,
  onScheduleTask,
  onScheduleProject,
  onReorderTask,
  onDraggingChange,
  onOpenProject,
}: Props) {
  const [expandedProjects, setExpandedProjects] = useState<string[]>([]);
  const blockClickUntil = useRef(0);

  const toggleProject = (id: string) => {
    setExpandedProjects((current) =>
      current.includes(id)
        ? current.filter((projectId) => projectId !== id)
        : [...current, id]
    );
  };

  const blockDropClick = () => {
    blockClickUntil.current = Date.now() + 450;
  };

  const isOverToday = (info: PanInfo) => {
    const target = Array.from(
      document.querySelectorAll('[data-drop-zone="today"]')
    ).find((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0;
    });
    if (!target) return false;
    const bounds = target.getBoundingClientRect();
    const tolerance = 36;
    return (
      info.point.x >= bounds.left - tolerance &&
      info.point.x <= bounds.right + tolerance &&
      info.point.y >= bounds.top - tolerance &&
      info.point.y <= bounds.bottom + tolerance
    );
  };

  const reorderTargetAt = (draggedId: string, info: PanInfo) => {
    const list = Array.from(
      document.querySelectorAll<HTMLElement>('[data-week-sort-list="true"]')
    ).find((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0;
    });
    if (!list) return null;
    const listBounds = list.getBoundingClientRect();
    if (
      info.point.x < listBounds.left - 24 ||
      info.point.x > listBounds.right + 24 ||
      info.point.y < listBounds.top - 24 ||
      info.point.y > listBounds.bottom + 24
    ) {
      return null;
    }

    const rows = Array.from(
      list.querySelectorAll<HTMLElement>("[data-week-sort-id]")
    );
    return rows.reduce<{ id: string; distance: number } | null>((nearest, row) => {
      const id = row.dataset.weekSortId;
      if (!id || id === draggedId) return nearest;
      const bounds = row.getBoundingClientRect();
      const distance = Math.abs(info.point.y - (bounds.top + bounds.height / 2));
      return !nearest || distance < nearest.distance ? { id, distance } : nearest;
    }, null)?.id ?? draggedId;
  };

  return (
    <section
      onClickCapture={(event) => {
        if (Date.now() < blockClickUntil.current) {
          event.preventDefault();
          event.stopPropagation();
          blockClickUntil.current = 0;
        }
      }}
      className="rounded-2xl border border-white/[0.07] bg-black/25 p-4 sm:p-5"
    >
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
        周记 / 计划
      </p>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-text-primary sm:text-xl">
          本周计划
        </h2>
        <Link
          href="/week"
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-accent-purple/25 bg-accent-purple/[0.06] px-3 py-1.5 text-xs font-medium text-accent-purple transition-all hover:border-accent-purple/50 hover:bg-accent-purple/[0.10]"
        >
          <CalendarDays className="h-3.5 w-3.5" />
          周视图
        </Link>
      </div>

      {/* Loose week tasks */}
      <div data-week-sort-list="true" className="mb-4 divide-y divide-white/[0.04]">
        {[...tasks]
          .sort((a, b) => Number(a.done) - Number(b.done))
          .map((task) => (
          <DraggableRow
            key={task.id}
            dataDragTaskId={task.id}
            dataWeekSortId={task.id}
            onActivate={() => onToggleTask(task.id)}
            onDelete={() => onDeleteTask?.(task.id)}
            onSchedule={() => onScheduleTask(task.id)}
            onReorder={(info) => {
              const targetId = reorderTargetAt(task.id, info);
              if (!targetId) return false;
              onReorderTask(task.id, targetId);
              return true;
            }}
            isOverToday={isOverToday}
            onDraggingChange={onDraggingChange}
            onDragCompleted={blockDropClick}
            className={`flex w-full items-center gap-3 py-2.5 text-left text-sm transition-colors ${
              task.done ? "opacity-50" : "hover:text-accent-purple"
            }`}
          >
            <DragHint />
            {task.done ? (
              <CheckCircle2 className="pointer-events-none h-4 w-4 shrink-0 text-accent-green" />
            ) : (
              <Circle className="pointer-events-none h-4 w-4 shrink-0 text-text-muted" />
            )}
            <span
              className={`pointer-events-none min-w-0 flex-1 ${
                task.done ? "text-text-muted line-through" : "text-text-secondary"
              }`}
            >
              {task.title}
            </span>
            <span className="pointer-events-none shrink-0 text-[10px] text-text-muted">
              {task.dueDate.slice(5)}
            </span>
          </DraggableRow>
        ))}
      </div>

      {/* Projects with expandable child tasks */}
      <div className="space-y-2">
        {projects.map((project) => {
          const tasksForProject = projectTasks.filter(
            (task) => task.projectId === project.id
          );
          if (tasksForProject.length === 0) return null;

          const total = tasksForProject.length;
          const done = tasksForProject.filter((task) => task.done).length;
          const completion = total > 0 ? Math.round((done / total) * 100) : 0;
          const isExpanded = expandedProjects.includes(project.id);

          return (
            <article
              key={project.id}
              className={`rounded-xl border transition-all duration-200 ${
                isExpanded
                  ? "border-accent-purple/25 bg-accent-purple/[0.04]"
                  : "border-white/[0.06] bg-black/20 hover:border-white/[0.10]"
              }`}
            >
              <div className="px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <DraggableRow
                    dataDragProjectId={project.id}
                    onActivate={() => toggleProject(project.id)}
                    onSchedule={() => onScheduleProject(project.id)}
                    isOverToday={isOverToday}
                    onDraggingChange={onDraggingChange}
                    onDragCompleted={blockDropClick}
                    ariaExpanded={isExpanded}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left text-sm"
                  >
                    <DragHint />
                    <FolderKanban className="pointer-events-none h-4 w-4 shrink-0 text-accent-purple" />
                    <span className="pointer-events-none min-w-0 flex-1 truncate font-medium text-text-primary">
                      {project.name}
                    </span>
                    <span className="pointer-events-none shrink-0 text-[11px] tabular-nums text-text-muted">
                      {done}/{total}
                    </span>
                  </DraggableRow>
                  {onOpenProject && (
                    <button
                      onClick={() => onOpenProject(project.id)}
                      className="flex shrink-0 items-center gap-1 rounded-full border border-accent-purple/20 bg-accent-purple/[0.06] px-2.5 py-1 text-[11px] font-medium text-accent-purple transition-colors hover:border-accent-purple/45 hover:bg-accent-purple/[0.12]"
                      aria-label={`进入项目页：${project.name}`}
                    >
                      进入
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    onClick={() => toggleProject(project.id)}
                    aria-label={isExpanded ? `收起项目：${project.name}` : `展开项目：${project.name}`}
                    className="shrink-0 rounded-lg p-1.5 text-text-muted transition-colors hover:text-text-primary"
                  >
                    <motion.span
                      animate={{ rotate: isExpanded ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="block"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </motion.span>
                  </button>
                </div>
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <motion.div
                    className="h-full rounded-full bg-accent-purple"
                    initial={{ width: 0 }}
                    animate={{ width: `${completion}%` }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                  />
                </div>
              </div>
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-white/[0.06] px-3 pb-3 pt-2">
                      {tasksForProject
                        .sort((a, b) => Number(a.done) - Number(b.done))
                        .map((task) => (
                        <DraggableRow
                          key={task.id}
                          dataDragTaskId={task.id}
                          onActivate={() => onToggleTask(task.id)}
                          onDelete={() => onDeleteTask?.(task.id)}
                          onSchedule={() => onScheduleTask(task.id)}
                          isOverToday={isOverToday}
                          onDraggingChange={onDraggingChange}
                          onDragCompleted={blockDropClick}
                          className="flex w-full items-center gap-2.5 py-2 text-left text-sm"
                        >
                          <DragHint />
                          {task.done ? (
                            <CheckCircle2 className="pointer-events-none h-3.5 w-3.5 shrink-0 text-accent-green" />
                          ) : (
                            <Circle className="pointer-events-none h-3.5 w-3.5 shrink-0 text-text-muted" />
                          )}
                          <span
                            className={`pointer-events-none min-w-0 flex-1 truncate text-[13px] ${
                              task.done
                                ? "text-text-muted line-through"
                                : "text-text-secondary hover:text-text-primary"
                            }`}
                          >
                            {task.title}
                          </span>
                          <span className="pointer-events-none text-[10px] text-text-muted">
                            {task.dueDate.slice(5)}
                          </span>
                        </DraggableRow>
                      ))}
                      <button className="mt-1 flex items-center gap-1.5 rounded-full border border-accent-purple/20 bg-accent-purple/[0.06] px-3 py-1.5 text-[11px] font-medium text-accent-purple transition-colors hover:border-accent-purple/40">
                        <Sparkles className="h-3 w-3" />
                        AI 继续拆解
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </article>
          );
        })}
      </div>
    </section>
  );
}

interface DraggableRowProps {
  children: ReactNode;
  className: string;
  onActivate: () => void;
  onDelete?: () => void;
  onSchedule: () => void;
  onReorder?: (info: PanInfo) => boolean;
  isOverToday: (info: PanInfo) => boolean;
  onDraggingChange: (dragging: boolean) => void;
  onDragCompleted: () => void;
  dataDragTaskId?: string;
  dataDragProjectId?: string;
  dataWeekSortId?: string;
  ariaExpanded?: boolean;
}

function DraggableRow({
  children,
  className,
  onActivate,
  onDelete,
  onSchedule,
  onReorder,
  isOverToday,
  onDraggingChange,
  onDragCompleted,
  dataDragTaskId,
  dataDragProjectId,
  dataWeekSortId,
  ariaExpanded,
}: DraggableRowProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const suppressNextClick = useRef(false);

  const handleDragEnd = (
    _: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => {
    suppressNextClick.current = true;
    onDragCompleted();
    onDraggingChange(false);
    if (isOverToday(info)) {
      x.set(0);
      y.set(0);
      onSchedule();
      return;
    }
    if (onReorder?.(info)) {
      x.set(0);
      y.set(0);
      return;
    }
    animate(x, 0, { type: "spring", stiffness: 420, damping: 34 });
    animate(y, 0, { type: "spring", stiffness: 420, damping: 34 });
  };

  return (
    <div className="group relative flex min-w-0 flex-1">
      <motion.button
        data-drag-task-id={dataDragTaskId}
        data-drag-project-id={dataDragProjectId}
        data-week-sort-id={dataWeekSortId}
        aria-expanded={ariaExpanded}
        drag
        dragMomentum={false}
        dragElastic={0.06}
        style={{ x, y }}
        onDragStart={() => onDraggingChange(true)}
        onDragEnd={handleDragEnd}
        onClick={() => {
          if (suppressNextClick.current) {
            suppressNextClick.current = false;
            return;
          }
          onActivate();
        }}
        className={`${className} ${onDelete ? "pr-8" : ""} cursor-grab select-none touch-none active:cursor-grabbing`}
        whileDrag={{
          scale: 1.02,
          backgroundColor: "rgba(156, 255, 109, 0.06)",
          borderRadius: 12,
          zIndex: 10,
        }}
      >
        {children}
      </motion.button>
      {onDelete && (
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          aria-label="删除任务"
          className="absolute right-0.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-text-muted opacity-0 transition-all hover:bg-red-400/10 hover:text-red-400 group-hover:opacity-100 focus:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function DragHint() {
  return (
    <span aria-hidden="true" className="pointer-events-none text-text-muted/50">
      <GripVertical className="h-3.5 w-3.5 shrink-0" />
    </span>
  );
}
