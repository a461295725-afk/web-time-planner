"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  LoaderCircle,
  RefreshCw,
  Save,
  Sparkles,
  Timer,
  TriangleAlert,
} from "lucide-react";
import MainLayout from "@/components/layout/main-layout";
import ConsoleHeader from "@/components/console-header";
import MemoryPanel from "@/components/memory-panel";
import { shiftDate, todayKey, weekStartKey } from "@/lib/date";
import {
  DailyStats,
  ReviewPeriodType,
  ReviewRecord,
  StalledProject,
  StatsPayload,
} from "@/lib/review-types";

type ReviewResponse = {
  review: ReviewRecord | null;
  stats: StatsPayload;
};

const EMPTY_FORM = { wins: "", blockers: "", nextAction: "", notes: "" };

export default function ReviewWorkspace() {
  const [periodType, setPeriodType] = useState<ReviewPeriodType>("daily");
  const [periodStart, setPeriodStart] = useState(todayKey());
  const [form, setForm] = useState(EMPTY_FORM);
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [stalled, setStalled] = useState<StalledProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [memoryReload, setMemoryReload] = useState(0);

  const displayStart = periodType === "weekly" ? weekStartKey(periodStart) : periodStart;
  const displayEnd = periodType === "weekly" ? shiftDate(displayStart, 6) : displayStart;
  const isCurrent = displayEnd >= todayKey() && displayStart <= todayKey();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reviewResponse, stalledResponse] = await Promise.all([
        fetch(
          `/api/reviews?periodType=${periodType}&periodStart=${displayStart}`,
          { cache: "no-store" },
        ),
        fetch(`/api/reviews/stalled?asOf=${todayKey()}&days=7`, { cache: "no-store" }),
      ]);
      if (!reviewResponse.ok) throw new Error("复盘数据加载失败");
      const reviewData = (await reviewResponse.json()) as ReviewResponse;
      setStats(reviewData.stats);
      setForm(
        reviewData.review
          ? {
              wins: reviewData.review.wins,
              blockers: reviewData.review.blockers,
              nextAction: reviewData.review.nextAction,
              notes: reviewData.review.notes,
            }
          : EMPTY_FORM,
      );
      if (stalledResponse.ok) {
        const stalledData = (await stalledResponse.json()) as { items: StalledProject[] };
        setStalled(stalledData.items);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "复盘数据加载失败");
    } finally {
      setLoading(false);
    }
  }, [displayStart, periodType]);

  useEffect(() => {
    void load();
  }, [load]);

  const changePeriod = (offset: number) => {
    setPeriodStart(shiftDate(displayStart, periodType === "weekly" ? offset * 7 : offset));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodType, periodStart: displayStart, ...form }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "保存失败");
      }
      setNotice("复盘已保存");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const carryover = async () => {
    const targetDate = todayKey();
    const sourceDate = shiftDate(targetDate, -1);
    setNotice("");
    try {
      const response = await fetch("/api/reviews/carryover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceDate, targetDate }),
      });
      const data = (await response.json()) as {
        error?: string;
        moved?: unknown[];
        returnedToWeek?: unknown[];
        skipped?: unknown[];
      };
      if (!response.ok) throw new Error(data.error ?? "结转失败");
      setNotice(
        `昨日结转完成：P1 ${data.moved?.length ?? 0} 项，退回本周 ${data.returnedToWeek?.length ?? 0} 项` +
          ((data.skipped?.length ?? 0) > 0 ? `，已跳过 ${data.skipped?.length ?? 0} 项` : ""),
      );
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "结转失败");
    }
  };

  const observeMemories = async () => {
    setNotice("");
    try {
      const response = await fetch("/api/agent/memory/observe", { method: "POST" });
      const data = (await response.json()) as { candidates?: unknown[]; skipped?: unknown[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "观察失败");
      setMemoryReload((value) => value + 1);
      setNotice(
        data.candidates?.length
          ? `已更新 ${data.candidates.length} 条待确认记忆`
          : `证据不足，暂未生成长期记忆（${data.skipped?.length ?? 0} 项待积累）`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "观察失败");
    }
  };

  return (
    <MainLayout>
      <ConsoleHeader />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-5">
        <div>
          <p className="mb-2 text-[10px] font-semibold tracking-[0.28em] text-accent-green">
            REVIEW / MEMORY
          </p>
          <h2 className="text-2xl font-semibold text-text-primary">复盘与长期了解</h2>
          <p className="mt-2 text-sm text-text-muted">把完成情况、阻塞和真实习惯沉淀成下一次安排的依据。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/api/export"
            className="inline-flex items-center gap-1.5 rounded-full border border-accent-green/25 bg-accent-green/[0.06] px-3.5 py-2 text-xs font-medium text-accent-green"
          >
            <Download className="h-3.5 w-3.5" />
            导出我的数据
          </a>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3.5 py-2 text-xs text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回今日
          </Link>
        </div>
      </div>

      <section className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-black/20 p-3">
        <div className="flex rounded-full border border-white/[0.08] bg-black/25 p-1">
          {(["daily", "weekly"] as ReviewPeriodType[]).map((type) => (
            <button
              key={type}
              onClick={() => setPeriodType(type)}
              className={`rounded-full px-4 py-2 text-xs font-medium transition-colors ${
                periodType === type ? "bg-accent-green text-[#10120d]" : "text-text-muted hover:text-text-primary"
              }`}
            >
              {type === "daily" ? "每日复盘" : "每周复盘"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => changePeriod(-1)} aria-label="上一个周期" className="rounded-full border border-white/10 p-2 text-text-muted hover:text-text-primary">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-36 text-center text-sm text-text-secondary">
            {displayStart} {periodType === "weekly" ? `— ${displayEnd}` : ""}
          </span>
          <button onClick={() => changePeriod(1)} aria-label="下一个周期" className="rounded-full border border-white/10 p-2 text-text-muted hover:text-text-primary">
            <ChevronRight className="h-4 w-4" />
          </button>
          {!isCurrent && (
            <button onClick={() => setPeriodStart(todayKey())} className="rounded-full border border-accent-purple/25 px-3 py-2 text-xs text-accent-purple">
              回到今天
            </button>
          )}
        </div>
      </section>

      {loading && !stats ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-text-muted">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          正在加载复盘数据…
        </div>
      ) : (
        <>
          <StatsCards stats={stats} />
          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
            <form onSubmit={save} className="rounded-2xl border border-white/[0.07] bg-black/20 p-4 sm:p-5">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold tracking-[0.22em] text-text-muted">WRITE IT DOWN</p>
                  <h3 className="text-lg font-semibold">{periodType === "daily" ? "今天发生了什么" : "本周回顾"}</h3>
                </div>
                <button disabled={saving} className="inline-flex items-center gap-1.5 rounded-full bg-accent-green px-3.5 py-2 text-xs font-medium text-[#10120d] disabled:opacity-50">
                  {saving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  保存复盘
                </button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <ReviewField label="完成与收获" value={form.wins} onChange={(value) => setForm((current) => ({ ...current, wins: value }))} placeholder="完成了什么，哪些安排值得保留？" />
                <ReviewField label="阻塞因素" value={form.blockers} onChange={(value) => setForm((current) => ({ ...current, blockers: value }))} placeholder="什么让计划偏离了？" />
                <ReviewField label="下一步行动" value={form.nextAction} onChange={(value) => setForm((current) => ({ ...current, nextAction: value }))} placeholder="下一次打开工作台时先做什么？" />
                <ReviewField label="备注" value={form.notes} onChange={(value) => setForm((current) => ({ ...current, notes: value }))} placeholder="给未来自己的补充说明" />
              </div>
            </form>

            <section className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.03] p-4 sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold tracking-[0.22em] text-amber-300/70">EXPLICIT HANDOFF</p>
                  <h3 className="text-lg font-semibold">昨日任务结转</h3>
                </div>
                <ArrowRight className="h-5 w-5 text-amber-300" />
              </div>
              <p className="mb-4 text-sm leading-6 text-text-muted">P1 移到今天，P2/P3 退回本周待办。只有点击执行才会改变任务日期。</p>
              <button onClick={() => void carryover()} className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2.5 text-xs font-medium text-amber-200">
                <RefreshCw className="h-3.5 w-3.5" />
                执行昨日结转
              </button>
            </section>
          </div>

          <StalledSection items={stalled} />

          {stats && stats.days.length > 1 && <DailyBreakdown days={stats.days} />}

          <section className="mt-5 rounded-2xl border border-accent-purple/20 bg-accent-purple/[0.03] p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="mb-1.5 text-[10px] font-semibold tracking-[0.22em] text-accent-purple/80">LEARN CAREFULLY</p>
                <h3 className="text-lg font-semibold">从真实执行中更新候选记忆</h3>
                <p className="mt-1 text-sm text-text-muted">至少积累 3 次估时证据或 5 次专注时段证据；生成后仍需你确认。</p>
              </div>
              <button onClick={() => void observeMemories()} className="inline-flex items-center gap-2 rounded-full border border-accent-purple/30 bg-accent-purple/10 px-4 py-2.5 text-xs font-medium text-accent-purple">
                <Sparkles className="h-3.5 w-3.5" />
                观察执行记录
              </button>
            </div>
          </section>

          <MemoryPanel key={memoryReload} />
        </>
      )}

      {notice && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-accent-green/30 bg-[#182014] px-4 py-2.5 text-xs text-accent-green shadow-[0_0_26px_rgba(156,255,109,0.18)]">
          {notice}
        </div>
      )}
    </MainLayout>
  );
}

function ReviewField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="block text-xs text-text-muted">
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={4}
        className="mt-1.5 w-full resize-y rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2.5 text-sm leading-6 text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent-green/35"
      />
    </label>
  );
}

function StatsCards({ stats }: { stats: StatsPayload | null }) {
  const totals = stats?.totals;
  const cards = [
    { label: "计划任务", value: totals?.plannedCount ?? 0, suffix: "项", icon: BarChart3 },
    { label: "计划完成", value: totals?.plannedDoneCount ?? 0, suffix: "项", icon: CheckCircle2 },
    { label: "预计时间", value: totals?.plannedMinutes ?? 0, suffix: "分钟", icon: Timer },
    { label: "专注时间", value: totals?.focusedMinutes ?? 0, suffix: "分钟", icon: Timer },
    { label: "习惯完成率", value: `${Math.round((totals?.habitRate ?? 0) * 100)}%`, suffix: "", icon: CheckCircle2 },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.label} className="rounded-xl border border-white/[0.07] bg-black/25 p-3">
            <div className="mb-2 flex items-center gap-2 text-text-muted"><Icon className="h-3.5 w-3.5 text-accent-green" /><span className="text-[10px] tracking-[0.12em]">{card.label}</span></div>
            <p className="text-xl font-semibold tabular-nums text-text-primary">{card.value}<span className="ml-1 text-[10px] font-normal text-text-muted">{card.suffix}</span></p>
          </div>
        );
      })}
    </div>
  );
}

function DailyBreakdown({ days }: { days: DailyStats[] }) {
  return (
    <section className="mt-5 rounded-2xl border border-white/[0.07] bg-black/20 p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-accent-purple" /><h3 className="text-lg font-semibold">每日拆分</h3></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-xs">
          <thead className="text-text-muted"><tr className="border-b border-white/[0.07]"><th className="pb-2 font-normal">日期</th><th className="pb-2 font-normal">计划 / 完成</th><th className="pb-2 font-normal">预计分钟</th><th className="pb-2 font-normal">专注分钟</th><th className="pb-2 font-normal">习惯</th><th className="pb-2 font-normal">结转</th></tr></thead>
          <tbody>{days.map((day) => <tr key={day.date} className="border-b border-white/[0.04] text-text-secondary"><td className="py-2.5 font-mono text-text-primary">{day.date}</td><td className="py-2.5">{day.plannedDoneCount} / {day.plannedCount}</td><td className="py-2.5">{day.plannedMinutes}</td><td className="py-2.5">{day.focusedMinutes}</td><td className="py-2.5">{day.habitCompleted} / {day.habitTotal}</td><td className="py-2.5">{day.carryoverCount}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function StalledSection({ items }: { items: StalledProject[] }) {
  return (
    <section className="mt-5 rounded-2xl border border-red-300/15 bg-red-300/[0.025] p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-2"><TriangleAlert className="mt-0.5 h-4 w-4 text-red-300" /><div><p className="mb-1.5 text-[10px] font-semibold tracking-[0.22em] text-red-300/70">STALLED PROJECTS</p><h3 className="text-lg font-semibold">可能停滞的项目</h3></div></div>
      {items.length === 0 ? <p className="text-sm text-text-muted">暂时没有超过 7 天无活动且仍有未完成任务的项目。</p> : <div className="grid gap-3 md:grid-cols-2">{items.map((item) => <article key={item.id} className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5"><div className="flex items-start justify-between gap-3"><div><h4 className="font-medium text-text-primary">{item.name}</h4><p className="mt-1 text-xs text-text-muted">已停滞 {item.idleDays} 天 · {item.openTaskCount} 项未完成</p></div><span className="rounded-full border border-red-300/20 px-2 py-1 text-[10px] text-red-200">提醒</span></div>{item.nextAction && <p className="mt-3 flex items-start gap-2 text-sm text-text-secondary"><ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-green" /><span>下一步：{item.nextAction.title}</span></p>}</article>)}</div>}
    </section>
  );
}
