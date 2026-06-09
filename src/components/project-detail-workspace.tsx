"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarPlus,
  CheckCircle2,
  Circle,
  GripVertical,
  ListPlus,
  Pin,
  PinOff,
  Plus,
  Sparkles,
  LoaderCircle,
  Trash2,
} from "lucide-react";
import WorkspaceShell from "@/components/workspace-shell";
import { MarkdownEditor } from "@/components/markdown-editor";
import { ProjectItem, TaskItem } from "@/lib/mock-data";
import { todayKey } from "@/lib/date";
import { PublicSettings } from "@/lib/settings";

export default function ProjectDetailWorkspace({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [project, setProject] = useState<ProjectItem | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [newTask, setNewTask] = useState("");
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState("");
  const [groupName, setGroupName] = useState("");
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const draggedId = useRef<string | null>(null);
  const suppressClick = useRef(false);

  const load = async () => {
    const response = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { project: ProjectItem; tasks: TaskItem[] };
    setProject(data.project);
    setTasks(data.tasks);
    setName(data.project.name);
    setNote(data.project.description ?? "");
    setGroupName(data.project.groupName ?? "");
  };
  useEffect(() => {
    void load();
    void fetch("/api/settings", { cache: "no-store" })
      .then((response) => response.json())
      .then((value) => setSettings(value));
  }, [projectId]);

  const saveProject = async () => {
    await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: note, groupName: groupName || null }),
    });
    setNotice("项目笔记已保存");
    await load();
  };

  const togglePin = async () => {
    if (!project) return;
    await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !project.pinned }),
    });
    await load();
  };

  const addTask = async (event?: FormEvent, title = newTask) => {
    event?.preventDefault();
    if (!title.trim()) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        projectId,
        priority: settings?.defaultPriority,
      }),
    });
    setNewTask("");
    setNotice("已加入项目子任务");
    await load();
  };

  const patchTask = async (id: string, change: object) => {
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...change }),
    });
    await load();
  };

  const deleteTask = async (task: TaskItem) => {
    const response = await fetch("/api/tasks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: task.id }),
    });
    if (!response.ok) return;
    if (selectedTask?.id === task.id) setSelectedTask(null);
    setNotice(`“${task.title}”已删除`);
    await load();
  };

  const deleteProject = async () => {
    if (!project || !window.confirm(`删除项目“${project.name}”及其全部子任务？`)) return;
    const response = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    if (response.ok) router.push("/projects");
  };

  const addToWeekPlan = async (task: TaskItem) => {
    if (task.showInWeekPlan) return;
    await patchTask(task.id, { showInWeekPlan: true });
    setNotice(`“${task.title}”已加入本周计划`);
  };

  const setProjectInWeekPlan = async (showInWeekPlan: boolean) => {
    if (!project || Boolean(project.showInWeekPlan) === showInWeekPlan) return;
    const response = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ showInWeekPlan }),
    });
    if (!response.ok) return;
    setProject((await response.json()) as ProjectItem);
    setNotice(
      showInWeekPlan
        ? "项目已加入本周计划，可在周视图中安排子任务"
        : "项目已移出本周计划，已有日期安排保持不变"
    );
  };

  const generateTasks = async () => {
    setGenerating(true);
    setNotice("");
    try {
      const response = await fetch("/api/ai/decompose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: name || project?.name || "", note }),
      });
      const result = await response.json();
      if (response.ok) {
        setSuggestions(result.tasks);
        setNotice("AI 已生成建议，点击建议即可加入子任务");
      } else {
        setNotice(result.error ?? "AI 拆分失败，请检查设置");
      }
    } catch {
      setNotice("AI 连接失败，请检查网络与服务器设置");
    } finally {
      setGenerating(false);
    }
  };

  const reorderAt = async (targetId: string) => {
    const sourceId = draggedId.current;
    if (!sourceId || sourceId === targetId) return;
    const ordered = [...tasks];
    const source = ordered.findIndex((task) => task.id === sourceId);
    const target = ordered.findIndex((task) => task.id === targetId);
    const [dragged] = ordered.splice(source, 1);
    ordered.splice(target, 0, dragged);
    setTasks(ordered);
    await fetch("/api/tasks/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ordered.map((task) => task.id) }),
    });
  };

  if (!project) {
    return (
      <WorkspaceShell active="projects" kicker="PROJECT WORKSPACE" title="项目" description="正在载入项目内容...">
        <div className="rounded-2xl border border-white/[0.08] p-8 text-sm text-text-muted">载入中</div>
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell
      active="projects"
      kicker="PROJECT DETAIL"
      title={project.name}
      description="记录整体思路，将可执行的部分拆成任务并安排到今天。"
      action={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {project.showInWeekPlan ? (
            <button
              onClick={() => void setProjectInWeekPlan(false)}
              className="rounded-full border border-accent-green/25 bg-accent-green/10 px-3 py-2 text-xs text-accent-green transition-colors hover:border-white/20 hover:text-text-secondary"
            >
              已在本周计划 · 点击移出
            </button>
          ) : (
            <button
              onClick={() => void setProjectInWeekPlan(true)}
              className="flex items-center gap-1.5 rounded-full border border-accent-purple/25 bg-accent-purple/10 px-3 py-2 text-xs text-accent-purple"
            >
              <ListPlus className="h-3.5 w-3.5" />
              项目加入本周计划
            </button>
          )}
          <Link href="/projects" className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary">
            <ArrowLeft className="h-4 w-4" />
            返回项目列表
          </Link>
          <button
            onClick={() => void deleteProject()}
            className="flex items-center gap-1.5 rounded-full border border-red-400/25 px-3 py-2 text-xs text-red-400 transition-colors hover:bg-red-400/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            删除项目
          </button>
        </div>
      }
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.12fr)_minmax(360px,0.88fr)]">
        <section className="rounded-[24px] border border-white/[0.08] bg-card/45 p-4 sm:p-6">
          <label className="mb-2 block text-[10px] tracking-[0.24em] text-text-muted">项目名称</label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mb-5 w-full bg-transparent text-xl font-semibold text-text-primary outline-none"
          />

          <div className="mb-5 flex flex-wrap items-center gap-3">
            <button
              onClick={() => void togglePin()}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                project.pinned
                  ? "border-accent-green/25 bg-accent-green/10 text-accent-green"
                  : "border-white/[0.08] bg-white/[0.03] text-text-muted hover:text-text-secondary"
              }`}
            >
              {project.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
              {project.pinned ? "已置顶" : "置顶项目"}
            </button>
            <div className="flex items-center gap-2">
              <label className="text-[10px] tracking-[0.15em] text-text-muted">分组</label>
              <input
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="输入分组名"
                className="min-w-[120px] rounded-xl border border-white/[0.08] bg-black/20 px-3 py-1.5 text-xs outline-none placeholder:text-text-muted"
              />
            </div>
          </div>

          <p className="mb-3 text-[10px] tracking-[0.24em] text-text-muted">MARKDOWN 项目笔记</p>
          <MarkdownEditor
            value={note}
            onChange={setNote}
            placeholder="写下目标、资料、路线与判断。AI 拆分将参考这里的内容。"
            minHeight="min-h-[340px]"
          />
          <button
            onClick={saveProject}
            className="mt-4 rounded-full bg-accent-green px-4 py-2 text-sm text-[#10120d]"
          >
            保存项目笔记
          </button>
        </section>
        <section className="rounded-[24px] border border-white/[0.08] bg-card/45 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] tracking-[0.24em] text-text-muted">ACTION BREAKDOWN</p>
              <h3 className="mt-1 text-lg font-semibold">子任务</h3>
            </div>
            <button
              onClick={() => void generateTasks()}
              disabled={generating}
              className="flex items-center gap-1.5 rounded-full border border-accent-purple/25 bg-accent-purple/10 px-3 py-2 text-xs text-accent-purple"
            >
              {generating ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {generating ? "生成中" : "AI 拆分"}
            </button>
          </div>
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const id = draggedId.current;
              if (id) {
                void patchTask(id, { scheduledDate: todayKey() });
                setNotice("子任务已安排到今日");
              }
            }}
            className="mb-4 flex items-center justify-center gap-2 rounded-xl border border-dashed border-accent-green/30 bg-accent-green/[0.04] py-3 text-xs text-accent-green"
          >
            <CalendarPlus className="h-4 w-4" />
            将子任务拖到这里安排到今日
          </div>
          <form onSubmit={addTask} className="mb-3 flex gap-2">
            <input
              value={newTask}
              onChange={(event) => setNewTask(event.target.value)}
              placeholder="新增子任务"
              className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-sm outline-none placeholder:text-text-muted"
            />
            <button className="rounded-xl bg-accent-green/10 px-3 text-accent-green">
              <Plus className="h-4 w-4" />
            </button>
          </form>
          <div className="divide-y divide-white/[0.06]">
            {[...tasks]
              .sort((a, b) => Number(a.done) - Number(b.done))
              .map((task) => (
              <div
                key={task.id}
                draggable
                onDragStart={() => {
                  draggedId.current = task.id;
                  suppressClick.current = true;
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void reorderAt(task.id);
                }}
                onClick={() => {
                  if (suppressClick.current) {
                    suppressClick.current = false;
                    return;
                  }
                  void patchTask(task.id, { done: !task.done });
                }}
                className="group flex cursor-grab items-center gap-2.5 py-3 text-sm active:cursor-grabbing"
              >
                <GripVertical className="h-4 w-4 text-text-muted" />
                {task.done ? (
                  <CheckCircle2 className="h-4 w-4 text-accent-green" />
                ) : (
                  <Circle className="h-4 w-4 text-text-muted" />
                )}
                <span className={`min-w-0 flex-1 ${task.done ? "text-text-muted line-through" : ""}`}>
                  {task.title}
                </span>
                {task.showInWeekPlan ? (
                  <span className="shrink-0 rounded-full border border-accent-green/20 bg-accent-green/10 px-2.5 py-1 text-[10px] text-accent-green">
                    已在本周
                  </span>
                ) : (
                  <button
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      void addToWeekPlan(task);
                    }}
                    className="flex shrink-0 items-center gap-1 rounded-full border border-accent-purple/25 bg-accent-purple/10 px-2.5 py-1 text-[10px] text-accent-purple transition-colors hover:border-accent-purple/55"
                  >
                    <ListPlus className="h-3 w-3" />
                    加入本周计划
                  </button>
                )}
                <button
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedTask(task);
                  }}
                  className="text-[11px] text-text-muted hover:text-accent-purple"
                >
                  备注
                </button>
                <button
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    void deleteTask(task);
                  }}
                  aria-label={`删除任务：${task.title}`}
                  className="rounded-md p-1 text-text-muted opacity-0 transition-all hover:bg-red-400/10 hover:text-red-400 group-hover:opacity-100 focus:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          {suggestions.length > 0 && (
            <div className="mt-4 rounded-xl border border-accent-purple/20 bg-accent-purple/[0.06] p-3">
              <p className="mb-2 text-xs text-accent-purple">AI 建议：选择条目加入任务清单</p>
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => void addTask(undefined, suggestion)}
                  className="mb-2 block w-full rounded-lg bg-black/20 px-3 py-2 text-left text-xs text-text-secondary hover:text-text-primary"
                >
                  + {suggestion}
                </button>
              ))}
            </div>
          )}
          {selectedTask && (
            <div className="mt-4">
              <p className="mb-2 text-xs text-text-muted">{selectedTask.title} / Markdown 备注</p>
              <MarkdownEditor
                value={selectedTask.description ?? ""}
                onChange={(description) =>
                  setSelectedTask({ ...selectedTask, description })
                }
                minHeight="min-h-28"
              />
              <button
                onClick={() => {
                  void patchTask(selectedTask.id, { description: selectedTask.description ?? "" });
                  setSelectedTask(null);
                }}
                className="mt-2 rounded-full border border-accent-green/25 px-3 py-1.5 text-xs text-accent-green"
              >
                保存任务备注
              </button>
            </div>
          )}
          {notice && <p className="mt-4 text-xs text-accent-green">{notice}</p>}
        </section>
      </div>
    </WorkspaceShell>
  );
}
