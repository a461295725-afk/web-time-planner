"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  CalendarCheck,
  CalendarRange,
  CheckCircle2,
  Circle,
  Clock3,
  LoaderCircle,
  PauseCircle,
  RotateCcw,
  Save,
  Search,
} from "lucide-react";
import MainLayout from "@/components/layout/main-layout";
import ConsoleHeader from "@/components/console-header";
import { todayKey } from "@/lib/date";
import type { TaskDetail } from "@/lib/capture-search-types";

type TaskAction = "today" | "week" | "reopen";
type OutcomeKind = "done" | "partial" | "postponed" | "dropped";
type Outcome = {
  id: string;
  date: string;
  outcome: OutcomeKind;
  note: string;
  nextAction?: string;
  actualMinutes?: number;
  source: string;
};

const outcomeLabels: Record<OutcomeKind, string> = {
  done: "完成",
  partial: "部分完成",
  postponed: "推迟",
  dropped: "放弃",
};

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [outcomeKind, setOutcomeKind] = useState<OutcomeKind>("partial");
  const [outcomeNote, setOutcomeNote] = useState("");
  const [outcomeNextAction, setOutcomeNextAction] = useState("");
  const [actualMinutes, setActualMinutes] = useState("");
  const [rescheduleDate, setRescheduleDate] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const [taskResponse, outcomeResponse] = await Promise.all([
        fetch(`/api/search/task/${encodeURIComponent(id)}`, { cache: "no-store" }),
        fetch(`/api/tasks/${encodeURIComponent(id)}/outcomes`, { cache: "no-store" }),
      ]);
      if (!taskResponse.ok) {
        throw new Error(taskResponse.status === 404 ? "任务不存在或已删除" : "任务暂时无法加载");
      }
      setTask((await taskResponse.json()) as TaskDetail);
      if (outcomeResponse.ok) {
        const payload = (await outcomeResponse.json()) as { outcomes: Outcome[] };
        setOutcomes(payload.outcomes);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "任务暂时无法加载");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const perform = async (action: TaskAction) => {
    setSaving(action);
    setError("");
    try {
      const response = await fetch(`/api/search/task/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json()) as TaskDetail & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "任务更新失败");
      setTask(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "任务更新失败");
    } finally {
      setSaving(null);
    }
  };

  const saveExecution = async () => {
    if (!task) return;
    setSaving("execution");
    setError("");
    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: task.id,
          executionState: task.executionState,
          nextAction: task.nextAction,
          doneDefinition: task.doneDefinition,
          waitingOn: task.executionState === "waiting" ? task.waitingOn : null,
          followUpDate: task.executionState === "waiting" ? task.followUpDate : null,
          blocker: task.executionState === "blocked" ? task.blocker : null,
          estimatedMinutes: task.estimatedMinutes,
          taskLevel: task.taskLevel,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "执行信息保存失败");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "执行信息保存失败");
    } finally {
      setSaving(null);
    }
  };

  const submitOutcome = async (forcedKind?: OutcomeKind) => {
    const kind = forcedKind ?? outcomeKind;
    setSaving(`outcome:${kind}`);
    setError("");
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(id)}/outcomes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: todayKey(),
          outcome: kind,
          note: outcomeNote,
          nextAction: outcomeNextAction || task?.nextAction || undefined,
          actualMinutes: actualMinutes ? Number(actualMinutes) : undefined,
          rescheduleDate: rescheduleDate || undefined,
          waitingOn: kind === "postponed" ? task?.waitingOn || undefined : undefined,
          followUpDate: kind === "postponed" ? task?.followUpDate || undefined : undefined,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "结果记录失败");
      setOutcomeNote("");
      setOutcomeNextAction("");
      setActualMinutes("");
      setRescheduleDate("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "结果记录失败");
    } finally {
      setSaving(null);
    }
  };

  const updateTaskField = <K extends keyof TaskDetail>(key: K, value: TaskDetail[K]) => {
    setTask((current) => (current ? { ...current, [key]: value } : current));
  };

  return (
    <MainLayout>
      <ConsoleHeader />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-5">
        <div>
          <p className="mb-2 text-[10px] font-medium tracking-[0.28em] text-accent-green">TASK DETAIL</p>
          <h2 className="text-2xl font-semibold text-text-primary">任务详情</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/search" className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-xs text-text-secondary hover:border-accent-purple/30 hover:text-text-primary"><Search className="h-3.5 w-3.5" />返回搜索</Link>
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-full border border-accent-green/30 bg-accent-green/10 px-3.5 py-2 text-xs font-medium text-accent-green hover:bg-accent-green/15"><ArrowLeft className="h-3.5 w-3.5" />返回今日</Link>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-text-muted"><LoaderCircle className="h-4 w-4 animate-spin" />正在加载任务…</div>
      ) : error && !task ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-8 text-center text-sm text-red-300">{error}</div>
      ) : task ? (
        <div className="space-y-4">
          <article className="rounded-3xl border border-white/[0.08] bg-card/45 p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-accent-green/20 bg-accent-green/10 px-2.5 py-1 text-[10px] text-accent-green">{task.priority}</span>
                  <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-text-secondary">{task.taskLevel === "milestone" ? "里程碑" : task.taskLevel === "task" ? "任务" : "行动"}</span>
                  {task.done ? <span className="inline-flex items-center gap-1 text-[11px] text-accent-green"><CheckCircle2 className="h-3.5 w-3.5" />{task.completionOutcome === "dropped" ? "已放弃" : "已完成"}</span> : <span className="inline-flex items-center gap-1 text-[11px] text-text-muted"><Circle className="h-3.5 w-3.5" />未完成</span>}
                  {task.scheduledDate && <span className="text-[11px] text-text-muted">安排于 {task.scheduledDate}</span>}
                  {!task.scheduledDate && task.showInWeekPlan && <span className="text-[11px] text-accent-purple">本周待办</span>}
                </div>
                <h3 className="break-words text-xl font-semibold leading-8 text-text-primary sm:text-2xl">{task.title}</h3>
              </div>
            </div>
            <div className="mt-6 min-h-28 rounded-2xl border border-white/[0.06] bg-black/20 p-4 text-sm leading-7 text-text-secondary">
              {task.description ? <p className="whitespace-pre-wrap">{task.description}</p> : <p className="text-text-muted">还没有备注。</p>}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {!task.done && <>
                <button type="button" onClick={() => void perform("today")} disabled={saving !== null} className="inline-flex items-center gap-1.5 rounded-xl bg-accent-green px-4 py-2.5 text-xs font-medium text-[#10120d] disabled:opacity-50"><CalendarCheck className="h-3.5 w-3.5" />{saving === "today" ? "安排中…" : "安排今天"}</button>
                <button type="button" onClick={() => void perform("week")} disabled={saving !== null} className="inline-flex items-center gap-1.5 rounded-xl border border-accent-purple/25 bg-accent-purple/10 px-4 py-2.5 text-xs text-accent-purple disabled:opacity-50"><CalendarRange className="h-3.5 w-3.5" />{saving === "week" ? "处理中…" : "加入本周"}</button>
                <button type="button" onClick={() => void submitOutcome("done")} disabled={saving !== null} className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] px-4 py-2.5 text-xs text-text-secondary hover:border-accent-green/30 hover:text-accent-green disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" />{saving === "outcome:done" ? "保存中…" : "完成并记录"}</button>
              </>}
              {task.done && <button type="button" onClick={() => void perform("reopen")} disabled={saving !== null} className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] px-4 py-2.5 text-xs text-text-secondary hover:border-accent-green/30 hover:text-accent-green disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" />重新打开</button>}
            </div>
          </article>

          {!task.done && (
            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl border border-white/[0.08] bg-card/45 p-5">
                <h3 className="mb-4 text-sm font-medium text-text-primary">执行信息</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-text-muted">当前状态
                    <select value={task.executionState} onChange={(event) => updateTaskField("executionState", event.target.value as TaskDetail["executionState"])} className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-text-primary">
                      <option value="active">进行中</option><option value="waiting">等待中</option><option value="blocked">已阻塞</option>
                    </select>
                  </label>
                  <label className="text-xs text-text-muted">预计时长（分钟）
                    <input type="number" min={5} max={1440} value={task.estimatedMinutes ?? ""} onChange={(event) => updateTaskField("estimatedMinutes", event.target.value ? Number(event.target.value) : null)} className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-text-primary" />
                  </label>
                  <label className="text-xs text-text-muted sm:col-span-2">下一步行动
                    <input value={task.nextAction ?? ""} onChange={(event) => updateTaskField("nextAction", event.target.value || null)} placeholder="下一次坐下来时，具体先做什么" className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-text-primary" />
                  </label>
                  <label className="text-xs text-text-muted sm:col-span-2">完成标准
                    <input value={task.doneDefinition ?? ""} onChange={(event) => updateTaskField("doneDefinition", event.target.value || null)} placeholder="做到什么程度才算完成" className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-text-primary" />
                  </label>
                  {task.executionState === "waiting" && <>
                    <label className="text-xs text-text-muted">在等什么 / 谁
                      <input value={task.waitingOn ?? ""} onChange={(event) => updateTaskField("waitingOn", event.target.value || null)} className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-text-primary" />
                    </label>
                    <label className="text-xs text-text-muted">跟进日期
                      <input type="date" value={task.followUpDate ?? ""} onChange={(event) => updateTaskField("followUpDate", event.target.value || null)} className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-text-primary" />
                    </label>
                  </>}
                  {task.executionState === "blocked" && <label className="text-xs text-text-muted sm:col-span-2">阻塞原因
                    <input value={task.blocker ?? ""} onChange={(event) => updateTaskField("blocker", event.target.value || null)} className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-text-primary" />
                  </label>}
                </div>
                <button type="button" onClick={() => void saveExecution()} disabled={saving !== null} className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-accent-green/25 bg-accent-green/10 px-4 py-2.5 text-xs text-accent-green disabled:opacity-50"><Save className="h-3.5 w-3.5" />{saving === "execution" ? "保存中…" : "保存执行信息"}</button>
              </div>

              <div className="rounded-3xl border border-white/[0.08] bg-card/45 p-5">
                <h3 className="mb-4 text-sm font-medium text-text-primary">记录今天的结果</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(["partial", "postponed", "done", "dropped"] as OutcomeKind[]).map((kind) => (
                    <button key={kind} type="button" onClick={() => setOutcomeKind(kind)} className={`rounded-xl border px-2 py-2 text-xs ${outcomeKind === kind ? "border-accent-purple/50 bg-accent-purple/10 text-accent-purple" : "border-white/[0.08] text-text-muted"}`}>{outcomeLabels[kind]}</button>
                  ))}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-text-muted">实际投入（分钟）
                    <input type="number" min={0} max={1440} value={actualMinutes} onChange={(event) => setActualMinutes(event.target.value)} className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-text-primary" />
                  </label>
                  <label className="text-xs text-text-muted">重新安排到
                    <input type="date" value={rescheduleDate} onChange={(event) => setRescheduleDate(event.target.value)} className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-text-primary" />
                  </label>
                  <label className="text-xs text-text-muted sm:col-span-2">下一步
                    <input value={outcomeNextAction} onChange={(event) => setOutcomeNextAction(event.target.value)} placeholder={task.nextAction ?? "例如：明天先补完第二部分"} className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-text-primary" />
                  </label>
                  <label className="text-xs text-text-muted sm:col-span-2">说明
                    <textarea value={outcomeNote} onChange={(event) => setOutcomeNote(event.target.value)} rows={2} className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-text-primary" />
                  </label>
                </div>
                <button type="button" onClick={() => void submitOutcome()} disabled={saving !== null} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-accent-purple/15 px-4 py-2.5 text-xs text-accent-purple disabled:opacity-50">
                  {outcomeKind === "postponed" ? <PauseCircle className="h-3.5 w-3.5" /> : outcomeKind === "dropped" ? <Ban className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                  {saving === `outcome:${outcomeKind}` ? "记录中…" : `记录${outcomeLabels[outcomeKind]}`}
                </button>
              </div>
            </section>
          )}

          <section className="rounded-3xl border border-white/[0.08] bg-card/45 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-text-primary">结果与来源</h3>
              <p className="text-[10px] text-text-muted">来源：{task.originSource}{task.originRef ? ` · ${task.originRef}` : ""}</p>
            </div>
            {outcomes.length > 0 ? <div className="mt-3 divide-y divide-white/[0.06]">
              {outcomes.slice(0, 8).map((outcome) => <div key={outcome.id} className="py-3 text-xs">
                <div className="flex flex-wrap items-center gap-2"><span className="text-text-primary">{outcome.date} · {outcomeLabels[outcome.outcome]}</span>{outcome.actualMinutes !== undefined && <span className="text-text-muted">{outcome.actualMinutes} 分钟</span>}<span className="text-[10px] text-text-muted">{outcome.source}</span></div>
                {outcome.nextAction && <p className="mt-1 text-accent-green">下一步：{outcome.nextAction}</p>}
                {outcome.note && <p className="mt-1 text-text-muted">{outcome.note}</p>}
              </div>)}
            </div> : <p className="mt-3 text-xs text-text-muted">还没有结果记录。完成、只做一半、推迟或放弃都可以如实记下。</p>}
          </section>

          {error && <p className="text-xs text-red-300">{error}</p>}
        </div>
      ) : null}
    </MainLayout>
  );
}
