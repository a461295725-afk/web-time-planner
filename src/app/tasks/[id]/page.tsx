"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarCheck,
  CalendarRange,
  CheckCircle2,
  Circle,
  LoaderCircle,
  RotateCcw,
  Search,
} from "lucide-react";
import MainLayout from "@/components/layout/main-layout";
import ConsoleHeader from "@/components/console-header";
import type { TaskDetail } from "@/lib/capture-search-types";

type TaskAction = "today" | "week" | "complete" | "reopen";

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<TaskAction | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/search/task/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 404 ? "任务不存在或已删除" : "任务暂时无法加载");
      setTask((await response.json()) as TaskDetail);
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
        <article className="rounded-3xl border border-white/[0.08] bg-card/45 p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-accent-green/20 bg-accent-green/10 px-2.5 py-1 text-[10px] text-accent-green">{task.priority}</span>
                {task.done ? <span className="inline-flex items-center gap-1 text-[11px] text-accent-green"><CheckCircle2 className="h-3.5 w-3.5" />已完成</span> : <span className="inline-flex items-center gap-1 text-[11px] text-text-muted"><Circle className="h-3.5 w-3.5" />未完成</span>}
                {task.scheduledDate && <span className="text-[11px] text-text-muted">安排于 {task.scheduledDate}</span>}
                {!task.scheduledDate && task.showInWeekPlan && <span className="text-[11px] text-accent-purple">本周待办</span>}
              </div>
              <h3 className="break-words text-xl font-semibold leading-8 text-text-primary sm:text-2xl">{task.title}</h3>
            </div>
          </div>
          <div className="mt-6 min-h-32 rounded-2xl border border-white/[0.06] bg-black/20 p-4 text-sm leading-7 text-text-secondary">
            {task.description ? <p className="whitespace-pre-wrap">{task.description}</p> : <p className="text-text-muted">还没有备注。</p>}
          </div>
          {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            {!task.done && <>
              <button type="button" onClick={() => void perform("today")} disabled={saving !== null} className="inline-flex items-center gap-1.5 rounded-xl bg-accent-green px-4 py-2.5 text-xs font-medium text-[#10120d] disabled:opacity-50"><CalendarCheck className="h-3.5 w-3.5" />{saving === "today" ? "安排中…" : "安排今天"}</button>
              <button type="button" onClick={() => void perform("week")} disabled={saving !== null} className="inline-flex items-center gap-1.5 rounded-xl border border-accent-purple/25 bg-accent-purple/10 px-4 py-2.5 text-xs text-accent-purple disabled:opacity-50"><CalendarRange className="h-3.5 w-3.5" />{saving === "week" ? "处理中…" : "加入本周"}</button>
              <button type="button" onClick={() => void perform("complete")} disabled={saving !== null} className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] px-4 py-2.5 text-xs text-text-secondary hover:border-accent-green/30 hover:text-accent-green disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" />{saving === "complete" ? "保存中…" : "标记完成"}</button>
            </>}
            {task.done && <button type="button" onClick={() => void perform("reopen")} disabled={saving !== null} className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] px-4 py-2.5 text-xs text-text-secondary hover:border-accent-green/30 hover:text-accent-green disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" />重新打开</button>}
          </div>
          <p className="mt-5 text-[10px] text-text-muted">任务仍保留为同一条记录，安排后会同步到首页、周计划和月历。</p>
        </article>
      ) : null}
    </MainLayout>
  );
}
