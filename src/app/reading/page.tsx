"use client";

import { FormEvent, useEffect, useState } from "react";
import { BookOpen, CheckCircle2, Circle, ExternalLink, Plus, Trash2 } from "lucide-react";
import WorkspaceShell from "@/components/workspace-shell";
import { ReadingItem } from "@/lib/mock-data";

export default function ReadingPage() {
  const [items, setItems] = useState<ReadingItem[]>([]);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    const response = await fetch("/api/reading", { cache: "no-store" });
    setItems(await response.json());
  };
  useEffect(() => {
    void load();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const response = await fetch("/api/reading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, title, notes }),
    });
    const result = await response.json();
    if (!response.ok) {
      setNotice(result.error);
      return;
    }
    setNotice(result.existed ? "这篇文章已经在列表中，已更新标题与备注" : "已加入稍后阅读");
    setUrl("");
    setTitle("");
    setNotes("");
    await load();
  };

  const toggle = async (item: ReadingItem) => {
    await fetch(`/api/reading/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRead: !item.isRead }),
    });
    await load();
  };

  const remove = async (id: string) => {
    await fetch(`/api/reading/${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <WorkspaceShell
      active="reading"
      kicker="READ LATER"
      title="稍后阅读"
      description="先轻松收住值得看的文章，等真正有时间时再逐一读完。"
    >
      <form
        onSubmit={submit}
        className="mb-6 rounded-[24px] border border-accent-green/15 bg-card/50 p-4 sm:p-5"
      >
        <div className="mb-3 flex items-center gap-2 text-sm text-accent-green">
          <Plus className="h-4 w-4" />
          快速收集链接
        </div>
        <div className="grid gap-3 lg:grid-cols-[1.35fr_0.85fr_1fr_auto]">
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            required
            placeholder="https:// 文章链接"
            className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm outline-none placeholder:text-text-muted"
          />
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="标题（可选）"
            className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm outline-none placeholder:text-text-muted"
          />
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="为什么值得读"
            className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm outline-none placeholder:text-text-muted"
          />
          <button className="rounded-xl bg-accent-green px-4 py-2.5 text-sm text-[#10120d]">
            收藏
          </button>
        </div>
        {notice && <p className="mt-3 text-xs text-accent-green">{notice}</p>}
      </form>
      <div className="space-y-3">
        {items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/[0.09] p-10 text-center text-sm text-text-muted">
            还没有待读文章，粘贴一个链接开始收藏。
          </div>
        )}
        {items.map((item) => (
          <article
            key={item.id}
            className={`flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center ${
              item.isRead
                ? "border-white/[0.06] bg-card/25 text-text-muted"
                : "border-white/[0.09] bg-card/50"
            }`}
          >
            <button onClick={() => void toggle(item)} aria-label={item.isRead ? "标为未读" : "标为已读"}>
              {item.isRead ? (
                <CheckCircle2 className="h-5 w-5 text-accent-green" />
              ) : (
                <Circle className="h-5 w-5 text-text-muted" />
              )}
            </button>
            <BookOpen className="hidden h-5 w-5 shrink-0 text-accent-purple sm:block" />
            <div className="min-w-0 flex-1">
              <h3 className={`text-sm font-medium ${item.isRead ? "line-through" : "text-text-primary"}`}>
                {item.title}
              </h3>
              {item.notes && <p className="mt-1 text-xs text-text-muted">{item.notes}</p>}
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 flex max-w-full items-center gap-1 truncate text-xs text-accent-purple hover:underline"
              >
                {item.normalizedUrl}
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            </div>
            <span className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[10px] text-text-muted">
              {item.source === "manual" ? "手动收藏" : item.source}
            </span>
            <button
              onClick={() => void remove(item.id)}
              aria-label="删除收藏"
              className="self-end text-text-muted hover:text-text-primary sm:self-center"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </article>
        ))}
      </div>
    </WorkspaceShell>
  );
}
