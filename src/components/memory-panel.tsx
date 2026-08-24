"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import { AgentMemory, MemoryCategory } from "@/lib/review-types";

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  explicit: "明确设置",
  preference: "长期偏好",
  behavior: "行为统计",
  context: "近期上下文",
};

const EMPTY_DRAFT = {
  category: "explicit" as MemoryCategory,
  key: "",
  value: "",
};

export default function MemoryPanel() {
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/agent/memory", { cache: "no-store" });
      if (!response.ok) throw new Error("记忆加载失败");
      const data = (await response.json()) as { memories: AgentMemory[] };
      setMemories(data.memories);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "记忆加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(
    () =>
      (Object.keys(CATEGORY_LABELS) as MemoryCategory[]).map((category) => ({
        category,
        items: memories.filter((memory) => memory.category === category),
      })),
    [memories],
  );

  const parseValue = (value: string): unknown => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return trimmed;
    }
  };

  const addMemory = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.key.trim()) return;
    setSaving(true);
    try {
      const response = await fetch("/api/agent/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, value: parseValue(draft.value) }),
      });
      const data = (await response.json()) as AgentMemory & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "记忆保存失败");
      setDraft(EMPTY_DRAFT);
      setNotice("记忆已保存");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "记忆保存失败");
    } finally {
      setSaving(false);
    }
  };

  const updateValue = async (memory: AgentMemory) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/agent/memory/${memory.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: parseValue(editingValue) }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "记忆更新失败");
      setEditingId(null);
      setNotice("记忆已更新");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "记忆更新失败");
    } finally {
      setSaving(false);
    }
  };

  const confirm = async (memory: AgentMemory) => {
    const response = await fetch(`/api/agent/memory/${memory.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmed: !memory.confirmed }),
    });
    if (response.ok) {
      setNotice(memory.confirmed ? "已取消确认" : "已确认这条记忆");
      await load();
    }
  };

  const remove = async (memory: AgentMemory) => {
    if (!window.confirm(`删除“${memory.key}”这条记忆？`)) return;
    const response = await fetch(`/api/agent/memory/${memory.id}`, { method: "DELETE" });
    if (response.ok) {
      setNotice("记忆已删除");
      await load();
    }
  };

  return (
    <section className="mt-5 rounded-2xl border border-white/[0.07] bg-black/20 p-4 sm:p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1.5 text-[10px] font-semibold tracking-[0.22em] text-accent-purple/80">AGENT MEMORY</p>
          <h3 className="text-lg font-semibold">Agent 对我的了解</h3>
          <p className="mt-1 text-sm text-text-muted">这里的内容可查看、纠正和删除；未确认的推断不会自动成为硬规则。</p>
        </div>
        <span className="rounded-full border border-white/[0.08] px-3 py-1.5 text-[11px] text-text-muted">{memories.length} 条有效记忆</span>
      </div>

      <form onSubmit={addMemory} className="mb-6 grid gap-2 rounded-xl border border-accent-purple/15 bg-accent-purple/[0.03] p-3 sm:grid-cols-[130px_170px_minmax(0,1fr)_auto]">
        <select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as MemoryCategory }))} className="rounded-lg border border-white/[0.08] bg-black/25 px-2.5 py-2 text-xs text-text-primary outline-none">
          {(Object.keys(CATEGORY_LABELS) as MemoryCategory[]).map((category) => <option key={category} value={category}>{CATEGORY_LABELS[category]}</option>)}
        </select>
        <input value={draft.key} onChange={(event) => setDraft((current) => ({ ...current, key: event.target.value }))} placeholder="记忆键" className="rounded-lg border border-white/[0.08] bg-black/25 px-2.5 py-2 text-xs text-text-primary outline-none placeholder:text-text-muted" />
        <input value={draft.value} onChange={(event) => setDraft((current) => ({ ...current, value: event.target.value }))} placeholder="内容（文本或 JSON）" className="rounded-lg border border-white/[0.08] bg-black/25 px-2.5 py-2 text-xs text-text-primary outline-none placeholder:text-text-muted" />
        <button disabled={saving || !draft.key.trim()} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent-purple px-3 py-2 text-xs font-medium text-[#101116] disabled:opacity-50"><Plus className="h-3.5 w-3.5" />添加</button>
      </form>

      {loading ? <div className="flex items-center gap-2 py-8 text-sm text-text-muted"><LoaderCircle className="h-4 w-4 animate-spin" />正在加载记忆…</div> : <div className="grid gap-5 md:grid-cols-2">{grouped.map(({ category, items }) => <div key={category}><div className="mb-2 flex items-center gap-2"><span className="text-xs font-medium text-text-secondary">{CATEGORY_LABELS[category]}</span><span className="text-[10px] text-text-muted">{items.length}</span></div>{items.length === 0 ? <p className="rounded-xl border border-dashed border-white/[0.07] px-3 py-4 text-xs text-text-muted">暂时没有记录</p> : <div className="space-y-2">{items.map((memory) => <article key={memory.id} className="rounded-xl border border-white/[0.07] bg-black/20 p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-mono text-xs text-text-primary">{memory.key}</p><p className="mt-1 break-words text-sm leading-5 text-text-secondary">{JSON.stringify(memory.value)}</p></div><div className="flex shrink-0 items-center gap-1"><button onClick={() => void confirm(memory)} aria-label={memory.confirmed ? "取消确认" : "确认记忆"} className={`rounded-md p-1.5 ${memory.confirmed ? "text-accent-green" : "text-text-muted hover:text-accent-green"}`}><CheckCircle2 className="h-3.5 w-3.5" /></button><button onClick={() => { setEditingId(memory.id); setEditingValue(typeof memory.value === "string" ? memory.value : JSON.stringify(memory.value)); }} aria-label="编辑记忆" className="rounded-md p-1.5 text-text-muted hover:text-text-primary"><Check className="h-3.5 w-3.5" /></button><button onClick={() => void remove(memory)} aria-label="删除记忆" className="rounded-md p-1.5 text-text-muted hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button></div></div><div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-text-muted"><span>{memory.source === "inferred" ? "行为推断" : "用户设置"}</span><span>证据 {memory.evidenceCount}</span><span>置信度 {Math.round(memory.confidence * 100)}%</span>{memory.confirmed && <span className="text-accent-green">已确认</span>}{memory.expiresAt && <span>到期 {new Date(memory.expiresAt).toLocaleDateString("zh-CN")}</span>}</div>{editingId === memory.id && <div className="mt-3 flex gap-2"><input autoFocus value={editingValue} onChange={(event) => setEditingValue(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-accent-green/25 bg-black/25 px-2.5 py-2 text-xs text-text-primary outline-none" /><button onClick={() => void updateValue(memory)} disabled={saving} className="rounded-lg bg-accent-green px-3 py-2 text-xs text-[#10120d]">保存</button><button onClick={() => setEditingId(null)} className="rounded-lg border border-white/10 p-2 text-text-muted"><X className="h-3.5 w-3.5" /></button></div>}</article>)}</div>}</div>)}</div>}
      {notice && <p className="mt-4 text-xs text-accent-green">{notice}</p>}
    </section>
  );
}
