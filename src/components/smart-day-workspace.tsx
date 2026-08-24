"use client";

import { DragEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  GripVertical,
  LoaderCircle,
  Play,
  RefreshCw,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import MainLayout from "@/components/layout/main-layout";
import ConsoleHeader from "@/components/console-header";
import { shiftDate, todayKey } from "@/lib/date";
import {
  blockLabel,
  formatMinute,
  SmartDayBlock,
  SmartDayPlanItem,
  SmartDaySnapshot,
} from "@/lib/smart-day-types";

const BLOCKS: SmartDayBlock[] = ["morning", "afternoon", "evening"];

function priorityClass(priority: string): string {
  if (priority === "P1") return "border-red-300/30 bg-red-300/10 text-red-200";
  if (priority === "P2") return "border-accent-purple/25 bg-accent-purple/10 text-accent-purple";
  return "border-white/10 bg-white/[0.04] text-text-muted";
}

function minutesLabel(minutes: number | undefined): string {
  return minutes ? `${minutes} 分钟` : "约 30 分钟";
}

export default function SmartDayWorkspace() {
  const [date, setDate] = useState(todayKey());
  const [snapshot, setSnapshot] = useState<SmartDaySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now());

  const load = useCallback(async (requestedDate: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/smart-day?date=${requestedDate}`, { cache: "no-store" });
      const payload = (await response.json()) as SmartDaySnapshot & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "智能安排数据加载失败");
      setSnapshot(payload);
    } catch (value) {
      setError(value instanceof Error ? value.message : "智能安排数据加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(date);
  }, [date, load]);

  useEffect(() => {
    if (!snapshot?.focus.active) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [snapshot?.focus.active?.id]);

  const run = async (request: RequestInfo | URL, init?: RequestInit) => {
    const response = await fetch(request, init);
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "操作失败");
    return payload;
  };

  const generate = async () => {
    setGenerating(true);
    setError("");
    try {
      const payload = (await run("/api/smart-day/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, useAi: true }),
      })) as { plan: SmartDaySnapshot["plan"]; warnings?: string[]; usedAi?: boolean };
      setSnapshot((current) => (current ? { ...current, plan: payload.plan } : current));
      const warning = payload.warnings?.[0];
      setNotice(warning ?? (payload.usedAi ? "AI 草案已生成，请逐项确认" : "规则草案已生成，请逐项确认"));
    } catch (value) {
      setError(value instanceof Error ? value.message : "草案生成失败");
    } finally {
      setGenerating(false);
    }
  };

  const updateItem = async (
    item: SmartDayPlanItem,
    action: "accept" | "reject" | "move",
    position?: { block: SmartDayBlock; startMinute: number; endMinute: number }
  ) => {
    try {
      const payload = (await run(`/api/smart-day/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(position ?? {}),
        }),
      })) as SmartDayPlanItem;
      setSnapshot((current) => {
        if (!current?.plan) return current;
        return {
          ...current,
          plan: {
            ...current.plan,
            items: current.plan.items.map((candidate) =>
              candidate.id === payload.id ? payload : candidate
            ),
          },
        };
      });
    } catch (value) {
      setError(value instanceof Error ? value.message : "计划项更新失败");
    }
  };

  const confirm = async () => {
    if (!snapshot?.plan) return;
    try {
      const payload = (await run(`/api/smart-day/plans/${snapshot.plan.id}/confirm`, { method: "POST" })) as SmartDaySnapshot["plan"];
      setSnapshot((current) => (current ? { ...current, plan: payload } : current));
      setNotice("今天的安排已确认，任务日期已同步");
    } catch (value) {
      setError(value instanceof Error ? value.message : "计划确认失败");
    }
  };

  const startFocus = async (taskId: string, planItemId?: string) => {
    try {
      const payload = (await run("/api/focus-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, planItemId, date }),
      })) as SmartDaySnapshot["focus"]["active"];
      setSnapshot((current) =>
        current
          ? { ...current, focus: { ...current.focus, active: payload } }
          : current
      );
      setClock(Date.now());
    } catch (value) {
      setError(value instanceof Error ? value.message : "专注启动失败");
    }
  };

  const stopFocus = async () => {
    if (!snapshot?.focus.active) return;
    try {
      await run(`/api/focus-sessions/${snapshot.focus.active.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      await load(date);
      setNotice("专注已结束，实际耗时已记录");
    } catch (value) {
      setError(value instanceof Error ? value.message : "专注结束失败");
    }
  };

  const itemsByBlock = useMemo(() => {
    const result = new Map<SmartDayBlock, SmartDayPlanItem[]>();
    BLOCKS.forEach((block) => result.set(block, []));
    for (const item of snapshot?.plan?.items ?? []) {
      result.get(item.block)?.push(item);
    }
    result.forEach((items) => items.sort((first, second) => first.position - second.position));
    return result;
  }, [snapshot?.plan?.items]);

  const nextStartForBlock = (block: SmartDayBlock): number => {
    const window = snapshot?.settings.windows.find((candidate) => candidate.block === block);
    if (!window) return 0;
    const items = itemsByBlock.get(block) ?? [];
    return Math.max(window.startMinute, ...items.filter((item) => item.status !== "rejected").map((item) => item.endMinute));
  };

  const dropItem = (event: DragEvent<HTMLDivElement>, block: SmartDayBlock) => {
    event.preventDefault();
    if (!draggedItemId || !snapshot?.plan || snapshot.plan.status !== "draft") return;
    const item = snapshot.plan.items.find((candidate) => candidate.id === draggedItemId);
    if (!item) return;
    const duration = item.endMinute - item.startMinute;
    const window = snapshot.settings.windows.find((candidate) => candidate.block === block);
    if (!window) return;
    const startMinute = nextStartForBlock(block);
    if (startMinute + duration > window.endMinute) {
      setError("目标时段没有足够空间");
      return;
    }
    void updateItem(item, "move", {
      block,
      startMinute,
      endMinute: startMinute + duration,
    });
    setDraggedItemId(null);
  };

  const elapsedSeconds = snapshot?.focus.active
    ? Math.max(0, Math.floor((clock - snapshot.focus.active.startedAt) / 1000))
    : 0;

  return (
    <MainLayout>
      <ConsoleHeader />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-5">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-accent-green/25 bg-accent-green/[0.06] px-3 py-2 text-xs text-accent-green"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            今日总览
          </Link>
          <span className="rounded-full border border-accent-purple/25 bg-accent-purple/[0.06] px-3 py-2 text-xs text-accent-purple">
            SMART DAY
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDate((current) => shiftDate(current, -1))}
            className="rounded-full border border-white/10 p-2 text-text-muted hover:text-text-primary"
            aria-label="前一天"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-28 text-center text-sm text-text-secondary">{date}</span>
          <button
            type="button"
            onClick={() => setDate((current) => shiftDate(current, 1))}
            className="rounded-full border border-white/10 p-2 text-text-muted hover:text-text-primary"
            aria-label="后一天"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {date !== todayKey() && (
            <button
              type="button"
              onClick={() => setDate(todayKey())}
              className="rounded-full border border-accent-green/25 px-3 py-2 text-xs text-accent-green"
            >
              回到今天
            </button>
          )}
        </div>
      </div>

      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-medium tracking-[0.28em] text-accent-green">PLAN · FOCUS · LEARN</p>
          <h2 className="text-2xl font-semibold text-text-primary">智能安排今天</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
            先生成可检查的草案，再由你确认；拖动、拒绝和专注耗时都会成为后续个性化的依据。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void generate()}
            disabled={generating || loading}
            className="inline-flex items-center gap-2 rounded-full border border-accent-purple/35 bg-accent-purple/10 px-4 py-2.5 text-sm font-medium text-accent-purple disabled:opacity-50"
          >
            {generating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            生成安排草案
          </button>
          {snapshot?.plan?.status === "draft" && (
            <button
              type="button"
              onClick={() => void confirm()}
              className="inline-flex items-center gap-2 rounded-full border border-accent-green/35 bg-accent-green/10 px-4 py-2.5 text-sm font-medium text-accent-green"
            >
              <Check className="h-4 w-4" />
              确认今天安排
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-300/25 bg-red-300/10 px-4 py-3 text-sm text-red-200">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} aria-label="关闭错误"><X className="h-4 w-4" /></button>
        </div>
      )}
      {notice && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-accent-green/25 bg-accent-green/[0.06] px-4 py-3 text-sm text-accent-green">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")} aria-label="关闭提示"><X className="h-4 w-4" /></button>
        </div>
      )}

      {loading || !snapshot ? (
        <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-text-muted">
          <LoaderCircle className="h-4 w-4 animate-spin" /> 正在载入今天的安排…
        </div>
      ) : (
        <>
          <section className="mb-5 grid gap-3 sm:grid-cols-3">
            <StatCard label="今日容量" value={`${snapshot.settings.capacityMinutes} 分钟`} detail={`${snapshot.settings.windows.length} 个工作时段`} />
            <StatCard label="逾期任务" value={`${snapshot.overdueTasks.length} 项`} detail="优先处理或明确推迟" danger={snapshot.overdueTasks.length > 0} />
            <StatCard label="今日实际专注" value={`${snapshot.focus.todayActualMinutes} 分钟`} detail={snapshot.focus.active ? `正在专注：${snapshot.focus.active.task?.title ?? "任务"}` : "尚未开始专注"} />
          </section>

          {snapshot.focus.active && (
            <section className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent-green/30 bg-accent-green/[0.06] px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-accent-green/15 p-2 text-accent-green"><Clock3 className="h-4 w-4" /></div>
                <div>
                  <p className="text-xs text-text-muted">正在专注</p>
                  <p className="font-medium text-text-primary">{snapshot.focus.active.task?.title ?? "未关联任务"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-lg tabular-nums text-accent-green">{formatElapsed(elapsedSeconds)}</span>
                <button type="button" onClick={() => void stopFocus()} className="inline-flex items-center gap-1.5 rounded-full border border-red-300/25 bg-red-300/10 px-3 py-2 text-xs text-red-200">
                  <Square className="h-3.5 w-3.5 fill-current" /> 停止并记录
                </button>
              </div>
            </section>
          )}

          <section className="mb-5 rounded-2xl border border-white/[0.08] bg-black/20 p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="mb-1 text-[10px] tracking-[0.24em] text-text-muted">DRAFT WORKBENCH</p>
                <h3 className="text-lg font-semibold text-text-primary">
                  {snapshot.plan ? `第 ${snapshot.plan.version} 版 · ${snapshot.plan.status === "confirmed" ? "已确认" : "待确认"}` : "还没有今天的草案"}
                </h3>
                {snapshot.plan?.summary && <p className="mt-1 text-xs text-text-muted">{snapshot.plan.summary}</p>}
              </div>
              <span className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-text-muted">
                {snapshot.plan?.source === "ai" ? "AI + 规则校验" : "确定性规则"}
              </span>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              {BLOCKS.map((block) => {
                const window = snapshot.settings.windows.find((candidate) => candidate.block === block)!;
                const items = itemsByBlock.get(block) ?? [];
                return (
                  <div
                    key={block}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => dropItem(event, block)}
                    className="min-h-52 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 transition-colors hover:border-accent-purple/25"
                  >
                    <div className="mb-3 flex items-center justify-between border-b border-white/[0.06] pb-2">
                      <div>
                        <p className="text-sm font-medium text-text-primary">{blockLabel(block)}</p>
                        <p className="text-[11px] text-text-muted">{formatMinute(window.startMinute)}–{formatMinute(window.endMinute)}</p>
                      </div>
                      <span className="text-[11px] text-text-muted">{items.filter((item) => item.status !== "rejected").length} 项</span>
                    </div>
                    <div className="space-y-2">
                      {items.map((item) => (
                        <PlanItemCard
                          key={item.id}
                          item={item}
                          editable={snapshot.plan?.status === "draft"}
                          focusActive={snapshot.focus.active?.taskId === item.taskId}
                          onDragStart={() => setDraggedItemId(item.id)}
                          onAccept={() => void updateItem(item, "accept")}
                          onReject={() => void updateItem(item, "reject")}
                          onStartFocus={() => void startFocus(item.taskId, item.id)}
                        />
                      ))}
                      {items.length === 0 && <p className="rounded-lg border border-dashed border-white/10 px-3 py-5 text-center text-xs text-text-muted">把任务拖到这里</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.7fr)]">
            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="mb-1 text-[10px] tracking-[0.24em] text-text-muted">CANDIDATES</p>
                  <h3 className="text-lg font-semibold text-text-primary">待安排任务</h3>
                </div>
                <button type="button" onClick={() => void load(date)} className="rounded-full border border-white/10 p-2 text-text-muted hover:text-text-primary" aria-label="刷新任务">
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-2">
                {snapshot.tasks.map((task) => {
                  const planItem = snapshot.plan?.items.find((item) => item.taskId === task.id);
                  return (
                    <div key={task.id} draggable={Boolean(planItem)} onDragStart={() => planItem && setDraggedItemId(planItem.id)} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                      <GripVertical className="h-4 w-4 shrink-0 text-text-muted/50" />
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm ${task.done ? "text-text-muted line-through" : "text-text-secondary"}`}>{task.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-text-muted">
                          <span className={`rounded-full border px-1.5 py-0.5 ${priorityClass(task.priority)}`}>{task.priority}</span>
                          <span>{minutesLabel(task.estimatedMinutes)}</span>
                          {task.dueDate && task.dueDate < date && <span className="text-red-300">已逾期</span>}
                        </div>
                      </div>
                      {planItem && planItem.status === "rejected" && <span className="text-[11px] text-red-200">已拒绝</span>}
                      {planItem && planItem.status !== "rejected" && <span className="text-[11px] text-accent-green">已入草案</span>}
                    </div>
                  );
                })}
                {snapshot.tasks.length === 0 && <p className="py-6 text-center text-sm text-text-muted">今天没有可安排的候选任务</p>}
              </div>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="mb-1 text-[10px] tracking-[0.24em] text-text-muted">RULES</p>
                  <h3 className="text-lg font-semibold text-text-primary">工作约束</h3>
                </div>
                <Clock3 className="h-4 w-4 text-accent-purple" />
              </div>
              <div className="space-y-2">
                {snapshot.settings.windows.map((window) => (
                  <div key={window.block} className="flex items-center justify-between rounded-xl border border-white/[0.06] px-3 py-2.5 text-sm">
                    <span className="text-text-secondary">{blockLabel(window.block)}</span>
                    <span className="font-mono text-xs text-text-muted">{formatMinute(window.startMinute)}–{formatMinute(window.endMinute)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs leading-5 text-text-muted">
                每日容量 {snapshot.settings.capacityMinutes} 分钟。已确认的个人记忆会覆盖默认容量、默认时长和首选时段
                {snapshot.settings.memoryOverrides.estimateMultiplier
                  ? `，并按实际执行记录将估时修正为 ${snapshot.settings.memoryOverrides.estimateMultiplier} 倍`
                  : ""}。
              </p>
            </div>
          </section>
        </>
      )}
    </MainLayout>
  );
}

function StatCard({ label, value, detail, danger = false }: { label: string; value: string; detail: string; danger?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-black/20 px-4 py-3">
      <p className="text-[10px] tracking-[0.22em] text-text-muted">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${danger ? "text-red-200" : "text-text-primary"}`}>{value}</p>
      <p className="mt-1 text-xs text-text-muted">{detail}</p>
    </div>
  );
}

function PlanItemCard({
  item,
  editable,
  focusActive,
  onDragStart,
  onAccept,
  onReject,
  onStartFocus,
}: {
  item: SmartDayPlanItem;
  editable: boolean;
  focusActive: boolean;
  onDragStart: () => void;
  onAccept: () => void;
  onReject: () => void;
  onStartFocus: () => void;
}) {
  const rejected = item.status === "rejected";
  return (
    <div
      draggable={editable && !rejected}
      onDragStart={onDragStart}
      className={`rounded-xl border px-3 py-2.5 transition-colors ${
        rejected ? "border-red-300/15 bg-red-300/[0.04] opacity-60" : "border-white/[0.08] bg-black/20 hover:border-accent-purple/30"
      }`}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-text-muted/50" />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${rejected ? "text-text-muted line-through" : "text-text-primary"}`}>{item.task.title}</p>
          <p className="mt-1 text-[11px] text-text-muted">{formatMinute(item.startMinute)}–{formatMinute(item.endMinute)} · {item.endMinute - item.startMinute} 分钟</p>
          {item.reason && <p className="mt-1 text-[11px] leading-4 text-accent-purple/80">{item.reason}</p>}
        </div>
        <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] ${priorityClass(item.task.priority)}`}>{item.task.priority}</span>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5">
        {!rejected && !focusActive && (
          <button type="button" onClick={onStartFocus} className="inline-flex items-center gap-1 rounded-full border border-accent-green/20 px-2 py-1 text-[11px] text-accent-green hover:bg-accent-green/10">
            <Play className="h-3 w-3 fill-current" /> 专注
          </button>
        )}
        {editable && !rejected && item.status === "proposed" && (
          <button type="button" onClick={onAccept} className="inline-flex items-center gap-1 rounded-full border border-accent-green/20 px-2 py-1 text-[11px] text-accent-green hover:bg-accent-green/10"><Check className="h-3 w-3" />接受</button>
        )}
        {editable && !rejected && (
          <button type="button" onClick={onReject} className="inline-flex items-center gap-1 rounded-full border border-red-300/20 px-2 py-1 text-[11px] text-red-200 hover:bg-red-300/10"><X className="h-3 w-3" />拒绝</button>
        )}
        {rejected && <span className="text-[11px] text-red-200">已拒绝</span>}
      </div>
    </div>
  );
}

function formatElapsed(seconds: number): string {
  const hours = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${rest}`;
}
