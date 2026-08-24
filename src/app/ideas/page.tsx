"use client";

import { useEffect, useState } from "react";
import { ArrowRight, FolderKanban, Lightbulb, ListChecks, Plus, Trash2 } from "lucide-react";
import WorkspaceShell from "@/components/workspace-shell";
import { MarkdownEditor, MarkdownPreview } from "@/components/markdown-editor";
import { IdeaItem } from "@/lib/mock-data";
import { todayKey } from "@/lib/date";

export default function IdeasPage() {
  const [ideas, setIdeas] = useState<IdeaItem[]>([]);
  const [editing, setEditing] = useState<IdeaItem | null>(null);
  const [notice, setNotice] = useState("");

  const load = async () => {
    const response = await fetch("/api/ideas", { cache: "no-store" });
    setIdeas(await response.json());
  };
  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    const response = await fetch("/api/ideas", { method: "POST" });
    const idea = (await response.json()) as IdeaItem;
    setIdeas((current) => [idea, ...current]);
    setEditing(idea);
  };

  const save = async (idea = editing) => {
    if (!idea) return;
    const response = await fetch(`/api/ideas/${idea.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: idea.title, content: idea.content }),
    });
    if (response.ok) {
      setEditing(null);
      await load();
      setNotice("想法已保存");
    }
  };

  const convert = async (kind: "task" | "project") => {
    if (!editing) return;
    await save(editing);
    const response = await fetch(`/api/ideas/${editing.id}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, date: todayKey() }),
    });
    if (!response.ok) {
      setNotice("请先填写标题再进行转化");
      return;
    }
    setEditing(null);
    await load();
    setNotice(kind === "task" ? "已转为今日任务，正文保存在任务备注中" : "已转为项目，正文成为项目笔记");
  };

  const remove = async (id: string) => {
    await fetch(`/api/ideas/${id}`, { method: "DELETE" });
    if (editing?.id === id) setEditing(null);
    await load();
  };

  return (
    <WorkspaceShell
      active="ideas"
      kicker="IDEA LIBRARY"
      title="想法"
      description="先保留一个念头的完整形状，再选择它是否值得成为行动。"
      action={
        <button
          onClick={create}
          className="flex items-center gap-2 rounded-full bg-accent-green px-4 py-2.5 text-sm font-medium text-[#10120d]"
        >
          <Plus className="h-4 w-4" />
          新建想法
        </button>
      }
    >
      {notice && <p className="mb-4 text-sm text-accent-green">{notice}</p>}
      {ideas.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-white/[0.1] p-12 text-center text-sm text-text-muted">
          还没有想法卡片，创建第一张开始记录。
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {ideas.map((idea) =>
            editing?.id === idea.id ? (
              <article
                key={idea.id}
                className="rounded-[22px] border border-accent-purple/30 bg-card/55 p-4 sm:col-span-2 xl:col-span-3 sm:p-6"
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <input
                    autoFocus={!editing.title}
                    value={editing.title}
                    onChange={(event) =>
                      setEditing({ ...editing, title: event.target.value })
                    }
                    placeholder="想法标题"
                    className="min-w-[220px] flex-1 bg-transparent text-xl font-semibold outline-none placeholder:text-text-muted"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => void save()}
                      className="rounded-full bg-accent-green px-4 py-2 text-xs text-[#10120d]"
                    >
                      保存并收起
                    </button>
                    <button
                      onClick={() => void convert("task")}
                      className="flex items-center gap-1.5 rounded-full border border-accent-green/25 px-3 py-2 text-xs text-accent-green"
                    >
                      <ListChecks className="h-3.5 w-3.5" />转为今日任务
                    </button>
                    <button
                      onClick={() => void convert("project")}
                      className="flex items-center gap-1.5 rounded-full border border-accent-purple/25 px-3 py-2 text-xs text-accent-purple"
                    >
                      <FolderKanban className="h-3.5 w-3.5" />转为项目
                    </button>
                    <button
                      onClick={() => void remove(idea.id)}
                      aria-label="删除想法"
                      className="flex items-center gap-1.5 rounded-full border border-red-400/25 px-3 py-2 text-xs text-red-400 transition-colors hover:bg-red-400/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />删除
                    </button>
                  </div>
                </div>
                <MarkdownEditor
                  value={editing.content}
                  onChange={(content) => setEditing({ ...editing, content })}
                  placeholder="用 Markdown 写下思路、疑问、线索或可能的下一步..."
                  minHeight="min-h-56"
                />
              </article>
            ) : (
              <article
                key={idea.id}
                onClick={() => setEditing(idea)}
                className="cursor-pointer rounded-[22px] border border-white/[0.08] bg-card/45 p-4 transition-colors hover:border-white/[0.18]"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <span className="rounded-xl bg-yellow-400/10 p-2 text-yellow-400">
                    <Lightbulb className="h-4 w-4" />
                  </span>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      void remove(idea.id);
                    }}
                    aria-label="删除想法"
                    className="p-1.5 text-text-muted hover:text-text-primary"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <h3 className="mb-2 font-medium text-text-primary">
                  {idea.title || "未命名想法"}
                </h3>
                <MarkdownPreview value={idea.content} className="line-clamp-5 min-h-24" />
                <div className="mt-4 flex items-center justify-end text-xs text-accent-purple">
                  打开编辑 <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </div>
              </article>
            )
          )}
        </div>
      )}
    </WorkspaceShell>
  );
}
