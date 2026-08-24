"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Circle,
  ExternalLink,
  FolderKanban,
  Lightbulb,
  ListChecks,
  Search as SearchIcon,
} from "lucide-react";
import MainLayout from "@/components/layout/main-layout";
import ConsoleHeader from "@/components/console-header";
import type {
  SearchKind,
  SearchResponse,
  SearchResult,
  SearchStatus,
  SearchType,
} from "@/lib/capture-search-types";

const TYPE_FILTERS: { key: SearchType; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "task", label: "任务" },
  { key: "project", label: "项目" },
  { key: "idea", label: "想法" },
  { key: "reading", label: "稍后阅读" },
];

const STATUS_FILTERS: { key: SearchStatus; label: string }[] = [
  { key: "all", label: "全部状态" },
  { key: "open", label: "未完成" },
  { key: "done", label: "已完成" },
  { key: "unread", label: "未读" },
  { key: "read", label: "已读" },
  { key: "inbox", label: "收件箱" },
];

function labelFor(kind: SearchKind): string {
  if (kind === "task") return "任务";
  if (kind === "project") return "项目";
  if (kind === "idea") return "想法";
  return "稍后阅读";
}

function iconFor(kind: SearchKind) {
  if (kind === "task") return <ListChecks className="h-4 w-4" />;
  if (kind === "project") return <FolderKanban className="h-4 w-4" />;
  if (kind === "idea") return <Lightbulb className="h-4 w-4" />;
  return <BookOpen className="h-4 w-4" />;
}

function ResultCard({ result }: { result: SearchResult }) {
  const taskStatus = result.type === "task" ? result.meta.done : undefined;
  return (
    <Link href={result.href} className="group block rounded-2xl border border-white/[0.08] bg-card/45 p-4 transition-colors hover:border-accent-purple/30 hover:bg-card/70">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-accent-purple/10 p-2 text-accent-purple">{iconFor(result.type)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.15em] text-text-muted">{labelFor(result.type)}</span>
            {result.meta.priority && <span className="rounded-full border border-accent-green/20 px-2 py-0.5 text-[10px] text-accent-green">{result.meta.priority}</span>}
            {taskStatus === true && <CheckCircle2 className="h-3.5 w-3.5 text-accent-green" />}
            {taskStatus === false && <Circle className="h-3.5 w-3.5 text-text-muted" />}
            {result.type === "reading" && result.meta.isRead && <span className="text-[10px] text-text-muted">已读</span>}
          </div>
          <h3 className="mt-1 truncate text-sm font-medium text-text-primary group-hover:text-accent-purple">{result.title}</h3>
          {result.snippet && <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-text-muted">{result.snippet}</p>}
          {result.meta.url && (
            <span className="mt-2 flex max-w-full items-center gap-1 truncate text-[10px] text-accent-purple">
              {result.meta.url} <ExternalLink className="h-3 w-3 shrink-0" />
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<SearchType>("all");
  const [status, setStatus] = useState<SearchStatus>("all");
  const [payload, setPayload] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q") ?? "";
    setQuery(initial);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ q: query, type, status, limit: "50" });
        const response = await fetch(`/api/search?${params.toString()}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 401 ? "登录状态已失效" : "搜索暂时无法完成");
        setPayload((await response.json()) as SearchResponse);
        const next = query ? `/search?q=${encodeURIComponent(query)}` : "/search";
        if (typeof window !== "undefined" && window.location.pathname + window.location.search !== next) {
          window.history.replaceState({}, "", next);
        }
      } catch (cause) {
        if ((cause as Error).name !== "AbortError") setError(cause instanceof Error ? cause.message : "搜索暂时无法完成");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 120);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, type, status]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
  };

  return (
    <MainLayout>
      <ConsoleHeader />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-5">
        <div>
          <p className="mb-2 text-[10px] font-medium tracking-[0.28em] text-accent-purple">GLOBAL SEARCH</p>
          <h2 className="text-2xl font-semibold text-text-primary">全局搜索</h2>
          <p className="mt-2 text-sm text-text-muted">一次查找任务、项目笔记、想法和稍后阅读。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/inbox" className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-xs text-text-secondary hover:border-accent-green/30 hover:text-text-primary">收件箱</Link>
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-full border border-accent-green/30 bg-accent-green/10 px-3.5 py-2 text-xs font-medium text-accent-green hover:bg-accent-green/15"><ArrowLeft className="h-3.5 w-3.5" />返回今日</Link>
        </div>
      </div>

      <form onSubmit={submit} className="mb-5 flex items-center gap-2 rounded-2xl border border-accent-purple/20 bg-card/50 p-2.5">
        <SearchIcon className="ml-2 h-4 w-4 shrink-0 text-accent-purple" />
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务、项目笔记、想法或链接…" className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted" />
        <span className="hidden rounded-lg border border-white/[0.08] px-2 py-1 text-[10px] text-text-muted sm:inline">Ctrl/Cmd K</span>
      </form>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TYPE_FILTERS.map((item) => (
          <button key={item.key} type="button" onClick={() => setType(item.key)} className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${type === item.key ? "border-accent-purple/40 bg-accent-purple/10 text-accent-purple" : "border-white/[0.08] text-text-muted hover:border-white/[0.18] hover:text-text-primary"}`}>{item.label}</button>
        ))}
        <select value={status} onChange={(event) => setStatus(event.target.value as SearchStatus)} className="ml-auto rounded-full border border-white/[0.08] bg-card px-3 py-1.5 text-xs text-text-secondary outline-none">
          {STATUS_FILTERS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select>
      </div>

      {error && <p className="mb-4 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">{error}</p>}
      <div className="mb-3 flex items-center justify-between text-xs text-text-muted"><span>{loading ? "搜索中…" : payload ? `${payload.total} 条结果` : "输入关键词开始搜索"}</span>{payload?.query && <span>关键词：{payload.query}</span>}</div>
      {payload && payload.items.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-2">{payload.items.map((item) => <ResultCard key={`${item.type}-${item.id}`} result={item} />)}</div>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/[0.1] bg-black/15 p-12 text-center text-sm text-text-muted">没有匹配内容</div>
      )}
    </MainLayout>
  );
}
