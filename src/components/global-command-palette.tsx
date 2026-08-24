"use client";

import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Command,
  ExternalLink,
  FolderKanban,
  Inbox,
  Lightbulb,
  ListChecks,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import type {
  CaptureKind,
  SearchResult,
} from "@/lib/capture-search-types";

type PaletteMode = "commands" | "search" | "capture";

type CommandItem = {
  id: "search" | "inbox" | "task" | "idea" | "reading";
  label: string;
  description: string;
  icon: typeof Search;
  kind?: CaptureKind;
};

const COMMANDS: CommandItem[] = [
  {
    id: "search",
    label: "搜索全部",
    description: "查找任务、项目笔记、想法和稍后阅读",
    icon: Search,
  },
  {
    id: "inbox",
    label: "打开收件箱",
    description: "查看刚刚收集、还没有安排的内容",
    icon: Inbox,
  },
  {
    id: "task",
    label: "快速新建任务",
    description: "先收住，不自动安排到今天",
    icon: ListChecks,
    kind: "task",
  },
  {
    id: "idea",
    label: "记录一个想法",
    description: "保存标题和 Markdown 内容",
    icon: Lightbulb,
    kind: "idea",
  },
  {
    id: "reading",
    label: "收藏稍后阅读",
    description: "保存链接，之后再读",
    icon: BookOpen,
    kind: "reading",
  },
];

function typeLabel(kind: CaptureKind): string {
  if (kind === "task") return "任务";
  if (kind === "idea") return "想法";
  return "稍后阅读";
}

function resultMeta(result: SearchResult): string {
  if (result.type === "task") {
    if (result.meta.done) return "已完成";
    if (result.meta.scheduledDate) return `已排期 ${result.meta.scheduledDate}`;
    return "收件箱任务";
  }
  if (result.type === "project") return "项目笔记";
  if (result.type === "idea") return "想法内容";
  return result.meta.isRead ? "已读文章" : "未读文章";
}

export default function GlobalCommandPalette() {
  const { authenticated, loading: authLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PaletteMode>("commands");
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [captureKind, setCaptureKind] = useState<CaptureKind>("task");
  const [captureTitle, setCaptureTitle] = useState("");
  const [captureContent, setCaptureContent] = useState("");
  const [captureUrl, setCaptureUrl] = useState("");
  const [captureNotes, setCaptureNotes] = useState("");
  const [notice, setNotice] = useState("");

  const publicPath = pathname === "/login" || pathname === "/setup";

  const reset = useCallback(() => {
    setMode("commands");
    setQuery("");
    setSelectedIndex(0);
    setResults([]);
    setSearching(false);
    setCaptureKind("task");
    setCaptureTitle("");
    setCaptureContent("");
    setCaptureUrl("");
    setCaptureNotes("");
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    reset();
  }, [reset]);

  const openPalette = useCallback(() => {
    if (authLoading || !authenticated || publicPath) return;
    reset();
    setOpen(true);
  }, [authLoading, authenticated, publicPath, reset]);

  useEffect(() => {
    if (authLoading || !authenticated || publicPath) {
      setOpen(false);
      return;
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) close();
        else openPalette();
        return;
      }
      if (event.key === "Escape" && open) {
        event.preventDefault();
        close();
      }
    };
    const onOpenEvent = () => openPalette();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("time-planner:open-command", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("time-planner:open-command", onOpenEvent);
    };
  }, [authLoading, authenticated, publicPath, open, openPalette, close]);

  useEffect(() => {
    if (!open || mode !== "search") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ q: query, limit: "8" });
        const response = await fetch(`/api/search?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = (await response.json()) as { items: SearchResult[] };
        setResults(payload.items);
        setSelectedIndex(0);
      } catch {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 100);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, mode, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [mode, query]);

  const visibleCommands = useMemo(() => {
    const filtered = COMMANDS.filter((item) => {
      if (!query.trim()) return true;
      const haystack = `${item.label} ${item.description}`.toLowerCase();
      return haystack.includes(query.trim().toLowerCase());
    });
    if (query.trim() && !filtered.some((item) => item.id === "search")) {
      return [COMMANDS[0], ...filtered];
    }
    return filtered;
  }, [query]);

  const selectCommand = (item: CommandItem) => {
    if (item.id === "search") {
      setMode("search");
      setSelectedIndex(0);
      return;
    }
    if (item.id === "inbox") {
      close();
      router.push("/inbox");
      return;
    }
    setCaptureKind(item.kind ?? "task");
    setCaptureTitle("");
    setCaptureContent("");
    setCaptureUrl("");
    setCaptureNotes("");
    setMode("capture");
    setSelectedIndex(0);
  };

  const submitCapture = async (event: FormEvent) => {
    event.preventDefault();
    const input =
      captureKind === "reading"
        ? { kind: captureKind, url: captureUrl, title: captureTitle, notes: captureNotes }
        : { kind: captureKind, title: captureTitle, content: captureContent };
    try {
      const response = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const payload = (await response.json()) as { error?: string; existed?: boolean };
      if (!response.ok) {
        setNotice(payload.error ?? "收集失败");
        return;
      }
      const message = payload.existed
        ? "这篇链接已在稍后阅读中，已更新备注"
        : `${typeLabel(captureKind)}已收进收件箱`;
      close();
      setNotice(message);
      window.setTimeout(() => setNotice(""), 2600);
    } catch {
      setNotice("无法连接服务器");
    }
  };

  const handleContentKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (mode === "capture") return;
    const itemCount = mode === "commands" ? visibleCommands.length : results.length;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((index) => (index + 1) % Math.max(itemCount, 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((index) => (index - 1 + Math.max(itemCount, 1)) % Math.max(itemCount, 1));
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (mode === "commands") {
        const selected = visibleCommands[selectedIndex];
        if (selected) selectCommand(selected);
      } else {
        const selected = results[selectedIndex];
        if (selected) {
          close();
          router.push(selected.href);
        } else if (query.trim()) {
          close();
          router.push(`/search?q=${encodeURIComponent(query.trim())}`);
        }
      }
    }
  };

  if (!authenticated || authLoading || publicPath) {
    return null;
  }

  return (
    <>
      {notice && (
        <div className="fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 rounded-full border border-accent-green/30 bg-bg-secondary px-4 py-2.5 text-xs text-accent-green shadow-xl" role="status">
          {notice}
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 px-3 pt-[12vh] backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <section role="dialog" aria-modal="true" aria-label="全局命令面板" className="w-full max-w-2xl overflow-hidden rounded-3xl border border-white/[0.12] bg-bg-secondary shadow-[0_24px_100px_rgba(0,0,0,0.6)]">
            <div className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-3">
              {mode === "capture" ? (
                <div className="flex min-w-0 flex-1 items-center gap-2 text-sm text-text-primary">
                  <Plus className="h-4 w-4 shrink-0 text-accent-green" />
                  <span>{typeLabel(captureKind)} · 快速收集</span>
                </div>
              ) : (
                <>
                  {mode === "commands" ? <Command className="h-4 w-4 shrink-0 text-accent-green" /> : <Search className="h-4 w-4 shrink-0 text-accent-green" />}
                  <input
                    autoFocus
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={handleContentKeyDown}
                    placeholder="输入关键词，或选择一个操作…"
                    className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-text-primary outline-none placeholder:text-text-muted"
                  />
                </>
              )}
              <button type="button" onClick={close} aria-label="关闭命令面板" className="rounded-lg p-1.5 text-text-muted hover:bg-white/[0.06] hover:text-text-primary"><X className="h-4 w-4" /></button>
            </div>

            {mode === "commands" && (
              <div className="p-2">
                <p className="px-3 pb-2 pt-1 text-[10px] uppercase tracking-[0.18em] text-text-muted">COMMANDS</p>
                {visibleCommands.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <button key={`${item.id}-${index}`} type="button" onClick={() => selectCommand(item)} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors ${selectedIndex === index ? "bg-accent-green/10 text-text-primary" : "text-text-secondary hover:bg-white/[0.04]"}`}>
                      <span className={`rounded-xl p-2 ${selectedIndex === index ? "bg-accent-green/15 text-accent-green" : "bg-white/[0.05] text-text-muted"}`}><Icon className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.label}</span><span className="mt-0.5 block truncate text-xs text-text-muted">{item.description}</span></span>
                      {selectedIndex === index && <span className="text-[10px] text-accent-green">Enter</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {mode === "search" && (
              <div className="max-h-[52vh] overflow-y-auto p-2">
                <div className="flex items-center justify-between px-3 pb-2 pt-1 text-[10px] uppercase tracking-[0.18em] text-text-muted"><span>SEARCH</span><span>{searching ? "搜索中…" : `${results.length} 条`}</span></div>
                {results.map((result, index) => (
                  <button key={`${result.type}-${result.id}`} type="button" onClick={() => { close(); router.push(result.href); }} className={`flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors ${selectedIndex === index ? "bg-accent-purple/10" : "hover:bg-white/[0.04]"}`}>
                    <span className="mt-0.5 rounded-xl bg-accent-purple/10 p-2 text-accent-purple">{result.type === "project" ? <FolderKanban className="h-4 w-4" /> : result.type === "idea" ? <Lightbulb className="h-4 w-4" /> : result.type === "reading" ? <BookOpen className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm text-text-primary">{result.title}</span><span className="mt-1 block truncate text-xs text-text-muted">{resultMeta(result)}{result.snippet ? ` · ${result.snippet}` : ""}</span></span>
                    <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-text-muted" />
                  </button>
                ))}
                {!searching && results.length === 0 && <p className="px-3 py-8 text-center text-sm text-text-muted">没有匹配内容，按 Enter 查看完整搜索</p>}
                <button type="button" onClick={() => { close(); router.push(`/search${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`); }} className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.07] px-3 py-2.5 text-xs text-text-muted hover:border-accent-purple/30 hover:text-accent-purple"><Search className="h-3.5 w-3.5" />打开完整搜索</button>
              </div>
            )}

            {mode === "capture" && (
              <form onSubmit={submitCapture} className="p-4">
                <div className="mb-4 flex flex-wrap gap-2">
                  {(["task", "idea", "reading"] as CaptureKind[]).map((kind) => (
                    <button key={kind} type="button" onClick={() => { setCaptureKind(kind); setNotice(""); }} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${captureKind === kind ? "border-accent-green/35 bg-accent-green/10 text-accent-green" : "border-white/[0.08] text-text-muted hover:border-white/[0.18]"}`}>
                      {kind === "task" ? <ListChecks className="h-3.5 w-3.5" /> : kind === "idea" ? <Lightbulb className="h-3.5 w-3.5" /> : <BookOpen className="h-3.5 w-3.5" />}
                      {typeLabel(kind)}
                    </button>
                  ))}
                </div>
                {captureKind === "reading" ? (
                  <div className="space-y-3">
                    <input autoFocus value={captureUrl} onChange={(event) => setCaptureUrl(event.target.value)} placeholder="https:// 文章链接" required type="url" className="w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm outline-none placeholder:text-text-muted focus:border-accent-green/30" />
                    <input value={captureTitle} onChange={(event) => setCaptureTitle(event.target.value)} placeholder="标题（可选）" className="w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm outline-none placeholder:text-text-muted focus:border-accent-green/30" />
                    <input value={captureNotes} onChange={(event) => setCaptureNotes(event.target.value)} placeholder="为什么值得读（可选）" className="w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm outline-none placeholder:text-text-muted focus:border-accent-green/30" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <input autoFocus value={captureTitle} onChange={(event) => setCaptureTitle(event.target.value)} placeholder={captureKind === "task" ? "任务标题" : "想法标题"} required className="w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm outline-none placeholder:text-text-muted focus:border-accent-green/30" />
                    <textarea value={captureContent} onChange={(event) => setCaptureContent(event.target.value)} placeholder={captureKind === "task" ? "备注（可选）" : "用 Markdown 写下思路（可选）"} rows={captureKind === "task" ? 2 : 5} className="w-full resize-none rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm outline-none placeholder:text-text-muted focus:border-accent-green/30" />
                  </div>
                )}
                {notice && <p className="mt-3 text-xs text-red-300" role="alert">{notice}</p>}
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-[10px] text-text-muted">保存后会进入收件箱，不会自动安排到今天。</p>
                  <div className="flex gap-2"><button type="button" onClick={() => setMode("commands")} className="rounded-xl px-3 py-2 text-xs text-text-muted hover:text-text-primary">返回</button><button type="submit" className="inline-flex items-center gap-1.5 rounded-xl bg-accent-green px-4 py-2 text-xs font-medium text-[#10120d]"><Plus className="h-3.5 w-3.5" />保存</button></div>
                </div>
              </form>
            )}
            {mode !== "capture" && <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2.5 text-[10px] text-text-muted"><span><ArrowUp className="mr-1 inline h-3 w-3" /><ArrowDown className="mr-1 inline h-3 w-3" />选择 · Enter 确认</span><span>Esc 关闭</span></div>}
          </section>
        </div>
      )}
    </>
  );
}
