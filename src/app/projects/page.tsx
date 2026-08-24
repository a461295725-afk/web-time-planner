"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ChevronDown, FolderKanban, GripVertical, Pencil, Pin, PinOff, Plus, Tag, Trash2, X } from "lucide-react";
import WorkspaceShell from "@/components/workspace-shell";
import { ProjectGroupItem, ProjectItem, TaskItem } from "@/lib/mock-data";
import { todayKey } from "@/lib/date";

const COMPLETED_GROUP = "已完结";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [projectGroups, setProjectGroups] = useState<ProjectGroupItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set([COMPLETED_GROUP]));
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedForGroup, setSelectedForGroup] = useState<Set<string>>(new Set());
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);

  const load = async () => {
    const [response, groupsResponse] = await Promise.all([
      fetch(`/api/dashboard?date=${todayKey()}`, { cache: "no-store" }),
      fetch("/api/project-groups", { cache: "no-store" }),
    ]);
    const data = await response.json();
    const groups = groupsResponse.ok ? await groupsResponse.json() : [];
    setProjects(data.projects);
    setTasks(data.tasks);
    setProjectGroups(groups);
  };
  useEffect(() => {
    void load();
  }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setName("");
    setCreating(false);
    await load();
  };

  const remove = async (project: ProjectItem) => {
    if (!window.confirm(`删除项目"${project.name}"及其全部子任务？`)) return;
    const response = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    if (response.ok) await load();
  };

  const togglePin = async (project: ProjectItem) => {
    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !project.pinned }),
    });
    await load();
  };

  const saveGroup = async (projectId: string) => {
    const name = editGroupName.trim();
    await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupName: name || null }),
    });
    setEditingGroupId(null);
    await load();
  };

  const createGroup = async () => {
    if (!newGroupName.trim()) return;
    const name = newGroupName.trim();
    const response = await fetch("/api/project-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) return;
    // Patch all selected projects + any with same groupName will auto-group
    for (const id of selectedForGroup) {
      await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupName: name }),
      });
    }
    setShowNewGroup(false);
    setNewGroupName("");
    setSelectedForGroup(new Set());
    await load();
  };

  const renameGroup = async (oldName: string) => {
    const newName = renameValue.trim();
    if (!newName || newName === oldName) {
      setRenamingGroup(null);
      return;
    }
    const response = await fetch("/api/project-groups", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldName, newName }),
    });
    if (!response.ok) return;
    setRenamingGroup(null);
    await load();
  };

  const reorderGroupProjects = async (groupName: string, ids: string[]) => {
    const targetGroupName = groupName === "未分组" ? null : groupName;
    const response = await fetch("/api/projects/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, groupName: targetGroupName }),
    });
    if (!response.ok) await load();
  };

  const moveProject = async (projectId: string, targetGroup: string, beforeId?: string) => {
    const targetGroupName = targetGroup === "未分组" ? undefined : targetGroup;
    const moving = projects.find((project) => project.id === projectId);
    if (!moving || targetGroup === COMPLETED_GROUP) return;

    const nextProjects = projects.map((project) =>
      project.id === projectId
        ? { ...project, groupName: targetGroupName }
        : project
    );
    const groupItems = nextProjects
      .filter((project) => !isComplete(project))
      .filter((project) => (project.groupName || "未分组") === targetGroup && project.id !== projectId)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (a.projectOrder ?? 0) - (b.projectOrder ?? 0));
    const insertAt = beforeId
      ? Math.max(0, groupItems.findIndex((project) => project.id === beforeId))
      : groupItems.length;
    groupItems.splice(insertAt, 0, { ...moving, groupName: targetGroupName });
    const orderedIds = groupItems.map((project) => project.id);

    setProjects((current) =>
      current.map((project) => {
        const order = orderedIds.indexOf(project.id);
        if (project.id === projectId) return { ...project, groupName: targetGroupName, projectOrder: order };
        return order >= 0 ? { ...project, projectOrder: order } : project;
      })
    );
    await reorderGroupProjects(targetGroup, orderedIds);
  };

  const toggleGroup = (name: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // Separate completed projects: has at least 1 task and ALL tasks are done
  const isComplete = (p: ProjectItem) => {
    const children = tasks.filter((t) => t.projectId === p.id);
    return children.length > 0 && children.every((t) => t.done);
  };
  const completedProjects = projects.filter(isComplete);
  const activeProjects = projects.filter((p) => !isComplete(p));

  // Group active projects by groupName
  const groups = new Map<string, ProjectItem[]>();
  for (const p of activeProjects) {
    const key = p.groupName || "未分组";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  // Sort: pinned first within each group
  for (const [, items] of groups) {
    items.sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        (a.projectOrder ?? 0) - (b.projectOrder ?? 0)
    );
  }

  for (const group of projectGroups) {
    if (!groups.has(group.name)) groups.set(group.name, []);
  }

  const groupOrder = new Map(projectGroups.map((group, index) => [group.name, index]));
  const sortedGroups: [string, ProjectItem[]][] = [...groups.entries()].sort((a, b) => {
    if (a[0] === "未分组" && b[0] !== "未分组") return 1;
    if (a[0] !== "未分组" && b[0] === "未分组") return -1;
    const orderA = groupOrder.get(a[0]);
    const orderB = groupOrder.get(b[0]);
    if (orderA !== undefined || orderB !== undefined) {
      return (orderA ?? Number.MAX_SAFE_INTEGER) - (orderB ?? Number.MAX_SAFE_INTEGER);
    }
    return a[0].localeCompare(b[0]);
  });

  // Append completed group at the very bottom
  const displayGroups = completedProjects.length > 0
    ? [...sortedGroups, [COMPLETED_GROUP, completedProjects] as [string, ProjectItem[]]]
    : sortedGroups;

  const renderCard = (project: ProjectItem, groupName: string) => {
    const children = tasks.filter((task) => task.projectId === project.id);
    const completed = children.filter((task) => task.done).length;
    const percent = children.length ? (completed / children.length) * 100 : 0;
    const next = children.find((task) => !task.done);
    return (
      <article
        key={project.id}
        draggable={!isComplete(project)}
        onDragStart={(event) => {
          setDraggedProjectId(project.id);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", project.id);
        }}
        onDragEnd={() => setDraggedProjectId(null)}
        onDragOver={(event) => {
          if (!draggedProjectId || draggedProjectId === project.id || groupName === COMPLETED_GROUP) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          event.preventDefault();
          const id = event.dataTransfer.getData("text/plain") || draggedProjectId;
          if (id && id !== project.id) void moveProject(id, groupName, project.id);
        }}
        className={`group relative rounded-[24px] border border-white/[0.08] bg-card/50 transition-colors hover:border-accent-purple/25 ${
          draggedProjectId === project.id ? "opacity-50" : ""
        }`}
      >
        {!isComplete(project) && (
          <span className="absolute left-3 top-4 z-10 cursor-grab rounded-lg p-1.5 text-text-muted opacity-0 transition-opacity hover:bg-white/[0.05] hover:text-text-primary group-hover:opacity-100">
            <GripVertical className="h-4 w-4" />
          </span>
        )}
        <Link href={`/projects/${project.id}`} className="block p-5">
          <div className="mb-5 flex items-start justify-between pr-8">
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-accent-purple/10 p-2.5 text-accent-purple">
                <FolderKanban className="h-5 w-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-text-primary">{project.name}</h3>
                  {project.pinned && (
                    <Pin className="h-3 w-3 text-accent-green" />
                  )}
                </div>
                <p className="mt-1 text-xs text-text-muted">
                  {project.dueDate ? `截止 ${project.dueDate}` : "未设截止日"}
                </p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-text-muted transition-transform group-hover:translate-x-1 group-hover:text-accent-purple" />
          </div>
          {/* Inline group tag */}
          <div className="mb-3">
            {editingGroupId === project.id ? (
              <span className="inline-flex items-center gap-1.5" onClick={(e) => e.preventDefault()}>
                <input
                  autoFocus
                  value={editGroupName}
                  onChange={(e) => setEditGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveGroup(project.id);
                    if (e.key === "Escape") setEditingGroupId(null);
                  }}
                  onBlur={() => void saveGroup(project.id)}
                  placeholder="分组名，留空取消"
                  className="w-28 rounded-lg border border-accent-green/30 bg-black/30 px-2 py-1 text-[11px] outline-none"
                />
                <button
                  onClick={() => setEditingGroupId(null)}
                  className="text-text-muted hover:text-text-primary"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ) : (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setEditGroupName(project.groupName || "");
                  setEditingGroupId(project.id);
                }}
                className="inline-flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.02] px-2 py-0.5 text-[10px] text-text-muted hover:border-accent-purple/25 hover:text-accent-purple transition-colors"
              >
                <Tag className="h-3 w-3" />
                {project.groupName || "未分组"}
                <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100" />
              </button>
            )}
          </div>
          <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-accent-green" style={{ width: `${percent}%` }} />
          </div>
          <p className="mb-3 text-xs text-text-muted">{completed}/{children.length} 项已完成</p>
          <p className="line-clamp-2 text-sm leading-6 text-text-secondary">
            {project.description?.replace(/[#*-]/g, "").trim() || "还没有项目笔记"}
          </p>
          <div className="mt-4 rounded-xl bg-black/20 px-3 py-2.5 text-xs text-text-secondary">
            下一步：{next?.title ?? "新增一个子任务"}
          </div>
        </Link>
        <div className="absolute right-4 top-4 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={() => void togglePin(project)}
            aria-label={project.pinned ? "取消置顶" : "置顶"}
            className="rounded-lg p-2 text-text-muted hover:bg-accent-green/10 hover:text-accent-green"
          >
            {project.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => void remove(project)}
            aria-label={`删除项目：${project.name}`}
            className="rounded-lg p-2 text-text-muted hover:bg-red-400/10 hover:text-red-400"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </article>
    );
  };

  return (
    <WorkspaceShell
      active="projects"
      kicker="PROJECT WORKSPACE"
      title="项目"
      description="把一个方向写清楚，再逐步拆成可以完成的行动。"
      action={
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setShowNewGroup(true);
              setSelectedForGroup(new Set());
            }}
            className="flex items-center gap-2 rounded-full border border-accent-purple/25 bg-accent-purple/[0.06] px-4 py-2.5 text-sm font-medium text-accent-purple transition-colors hover:bg-accent-purple/15"
          >
            <Plus className="h-4 w-4" />
            新建分组
          </button>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 rounded-full bg-accent-green px-4 py-2.5 text-sm font-medium text-[#10120d]"
          >
            <Plus className="h-4 w-4" />
            新建项目
          </button>
        </div>
      }
    >
      {creating && (
        <form
          onSubmit={create}
          className="mb-5 flex gap-2 rounded-2xl border border-accent-green/20 bg-accent-green/[0.04] p-3"
        >
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="项目名称"
            className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-text-muted"
          />
          <button className="rounded-xl bg-accent-green px-4 py-2 text-sm text-[#10120d]">创建</button>
          <button type="button" onClick={() => setCreating(false)} className="px-3 text-sm text-text-muted">取消</button>
        </form>
      )}

      {showNewGroup && (
        <div className="mb-5 rounded-2xl border border-accent-purple/20 bg-accent-purple/[0.04] p-4">
          <p className="mb-3 text-xs font-medium text-accent-purple">新建分组</p>
          <input
            autoFocus
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void createGroup();
              if (e.key === "Escape") setShowNewGroup(false);
            }}
            placeholder="分组名称"
            className="mb-3 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-sm outline-none placeholder:text-text-muted"
          />
          {activeProjects.filter((p) => !p.groupName).length > 0 && (
            <div className="mb-3">
              <p className="mb-2 text-[10px] text-text-muted">将现有项目加入分组（可选）</p>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {activeProjects
                  .filter((p) => !p.groupName)
                  .map((p) => (
                    <label
                      key={p.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-text-secondary hover:bg-white/[0.03]"
                    >
                      <input
                        type="checkbox"
                        checked={selectedForGroup.has(p.id)}
                        onChange={() => {
                          const next = new Set(selectedForGroup);
                          if (next.has(p.id)) next.delete(p.id);
                          else next.add(p.id);
                          setSelectedForGroup(next);
                        }}
                        className="rounded accent-accent-purple"
                      />
                      {p.name}
                    </label>
                  ))}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => void createGroup()}
              disabled={!newGroupName.trim()}
              className="rounded-xl bg-accent-purple px-4 py-2 text-xs text-white disabled:opacity-40"
            >
              创建分组
            </button>
            <button
              onClick={() => {
                setShowNewGroup(false);
                setNewGroupName("");
                setSelectedForGroup(new Set());
              }}
              className="rounded-xl px-4 py-2 text-xs text-text-muted"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {displayGroups.map(([groupName, items]) => {
        const isCollapsed = collapsedGroups.has(groupName);
        const isCompleted = groupName === COMPLETED_GROUP;
        // If there's only one group and it's "未分组" with no completed projects, render flat
        if (displayGroups.length === 1 && groupName === "未分组" && completedProjects.length === 0) {
          return (
            <div
              key={groupName}
              onDragOver={(event) => {
                if (!draggedProjectId) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData("text/plain") || draggedProjectId;
                if (id) void moveProject(id, groupName);
              }}
              className="grid gap-4 lg:grid-cols-2"
            >
              {items.map((project) => renderCard(project, groupName))}
            </div>
          );
        }
        return (
          <div
            key={groupName}
            onDragOver={(event) => {
              if (!draggedProjectId || isCompleted) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              event.preventDefault();
              const id = event.dataTransfer.getData("text/plain") || draggedProjectId;
              if (id && !isCompleted) void moveProject(id, groupName);
            }}
            className={`group/grp mb-6 rounded-2xl transition-colors ${
              draggedProjectId && !isCompleted ? "outline outline-1 outline-transparent hover:outline-accent-purple/25" : ""
            }`}
          >
            <div className="mb-3 flex items-center gap-2">
              <button
                onClick={() => toggleGroup(groupName)}
                className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] transition-colors ${
                  isCompleted
                    ? "text-text-muted hover:text-accent-green"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2
                    className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? "" : "text-accent-green"}`}
                  />
                ) : (
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                  />
                )}
                {renamingGroup === groupName ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void renameGroup(groupName);
                      if (e.key === "Escape") setRenamingGroup(null);
                    }}
                    onBlur={() => void renameGroup(groupName)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-28 rounded-lg border border-accent-green/30 bg-black/30 px-2 py-0.5 text-[11px] font-normal normal-case outline-none"
                  />
                ) : (
                  groupName
                )}
                <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                  isCompleted ? "bg-accent-green/10 text-accent-green" : "bg-white/[0.05]"
                }`}>
                  {items.length}
                </span>
              </button>
              {!isCompleted && groupName !== "未分组" && renamingGroup !== groupName && (
                <button
                  onClick={() => {
                    setRenameValue(groupName);
                    setRenamingGroup(groupName);
                  }}
                  className="text-text-muted opacity-0 hover:text-accent-purple group-hover/grp:opacity-100 transition-all"
                  title="重命名分组"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </div>
            {!isCollapsed && (
              <div className="grid min-h-16 gap-4 lg:grid-cols-2">
                {items.map((project) => renderCard(project, groupName))}
                {items.length === 0 && !isCompleted && (
                  <div className="rounded-2xl border border-dashed border-white/[0.10] px-4 py-8 text-center text-xs text-text-muted">
                    拖入项目
                  </div>
                )}
              </div>
            )}
            {isCollapsed && isCompleted && (
              <p className="text-[10px] text-text-muted">全部完成，点击展开回顾</p>
            )}
          </div>
        );
      })}
    </WorkspaceShell>
  );
}
