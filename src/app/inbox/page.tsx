"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  FolderKanban,
  Lightbulb,
  ListChecks,
  RefreshCw,
  Search,
} from "lucide-react";
import MainLayout from "@/components/layout/main-layout";
import ConsoleHeader from "@/components/console-header";
import type {
  CaptureKind,
  InboxItem,
  InboxResponse,
} from "@/lib/capture-search-types";

type InboxFilter = "all" | CaptureKind;

const FILTERS: { key: InboxFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "task", label: "任务" },
  { key: "idea", label: "想法" },
  { key: "reading", label: "稍后阅读" },
];

function kindIcon(kind: CaptureKind) {
  if (kind === "task") return <ListChecks className="h-4 w-4" />;
  if (kind === "idea") return <Lightbulb className="h-4 w-4" />;
  return <BookOpen className="h-4 w-4" />;
}

function kindLabel(kind: CaptureKind): string {
  if (kind === "task") return "任务";
  if (kind === "idea") return "想法";
  return "稍后阅读";
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function ItemCard({ item }: { item: InboxItem }) {
  const color =
    item.kind === "task"
      ? "text-accent-green bg-accent-green/10"
      : item.kind === "idea"
        ? "text-yellow-400 bg-yellow-400/10"
        : "text-accent-purple bg-accent-purple/10";
  return (
    <Link
      href={item.href}
      className="group block rounded-2xl border border-white/[0.08] bg-card/45 p-4 transition-colors hover:border-accent-green/30 hover:bg-card/70"
    >
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 rounded-xl p-2 ${color}`}>{kindIcon(item.kind)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.15em] text-text-muted">
              {kindLabel(item.kind)}
            </span>
            {item.meta.priority && (
              <span className="rounded-full border border-accent-green/20 px-2 py-0.5 text-[10px] text-accent-green">
                {item.meta.priority}
              </span>
            )}
          </div>
          <h3 className="mt-1 truncate text-sm font-medium text-text-primary group-hover:text-accent-green">
            {item.title || "未命名"}
          </h3>
          {item.preview && (
            <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-text-muted">
              {item.preview}
            </p>
          )}
          <p className="mt-3 text-[10px] text-text-muted">收集于 {formatTime(item.updatedAt)}</p>
        </div>
        <span className="shrink-0 text-xs text-text-muted transition-colors group-hover:text-accent-green">打开</span>
      </div>
    </Link>
  );
}

export default function InboxPage() {
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [payload, setPayload] = useState<InboxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/inbox?type=${filter}&limit=50`, { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 401 ? "登录状态已失效" : "收件箱暂时无法加载");
      setPayload((await response.json()) as InboxResponse);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "收件箱暂时无法加载");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <MainLayout>
      <ConsoleHeader />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-5">
        <div>
          <p className="mb-2 text-[10px] font-medium tracking-[0.28em] text-accent-green">INBOX</p>
          <h2 className="text-2xl font-semibold text-text-primary">收件箱</h2>
          <p className="mt-2 text-sm text-text-muted">把刚刚想到的事情先收住，再决定何时安排。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/search" className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-xs text-text-secondary hover:border-accent-purple/30 hover:text-text-primary">
            <Search className="h-3.5 w-3.5" /> 全局搜索
          </Link>
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-full border border-accent-green/30 bg-accent-green/10 px-3.5 py-2 text-xs font-medium text-accent-green hover:bg-accent-green/15">
            <ArrowLeft className="h-3.5 w-3.5" /> 返回今日
          </Link>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {FILTERS.map((item) => {
          const count = payload?.counts[item.key] ?? 0;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`rounded-full border px-3.5 py-2 text-xs transition-colors ${
                filter === item.key
                  ? "border-accent-green/40 bg-accent-green/10 text-accent-green"
                  : "border-white/[0.08] bg-white/[0.03] text-text-muted hover:border-white/[0.18] hover:text-text-primary"
              }`}
            >
              {item.label} <span className="ml-1 tabular-nums">{count}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => void load()}
          aria-label="刷新收件箱"
          className="ml-auto rounded-full border border-white/[0.08] p-2 text-text-muted hover:border-white/[0.18] hover:text-text-primary"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && <p className="mb-4 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">{error}</p>}
      {loading && !payload ? (
        <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-10 text-center text-sm text-text-muted">正在加载收件箱…</div>
      ) : payload && payload.items.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-2">{payload.items.map((item) => <ItemCard key={`${item.kind}-${item.id}`} item={item} />)}</div>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/[0.1] bg-black/15 p-12 text-center">
          <FolderKanban className="mx-auto mb-3 h-6 w-6 text-text-muted" />
          <p className="text-sm text-text-secondary">这个收件箱目前是空的</p>
          <p className="mt-2 text-xs text-text-muted">按 Ctrl/Cmd+K，随时收集任务、想法或链接。</p>
        </div>
      )}
    </MainLayout>
  );
}
