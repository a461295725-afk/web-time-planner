"use client";

import Link from "next/link";
import { Bookmark, FolderKanban, Lightbulb, Plus } from "lucide-react";

export default function QuickActionBar({
  onCreateTask,
  active,
}: {
  onCreateTask?: () => void;
  active?: "projects" | "ideas" | "reading" | "week";
}) {
  const buttons = [
    { icon: FolderKanban, label: "项目", href: "/projects", key: "projects", color: "text-accent-purple" },
    { icon: Lightbulb, label: "想法", href: "/ideas", key: "ideas", color: "text-yellow-400" },
    { icon: Bookmark, label: "稍后阅读", href: "/reading", key: "reading", color: "text-accent-green" },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {onCreateTask ? (
        <button
          onClick={onCreateTask}
          className="flex items-center gap-1.5 rounded-full border border-accent-green/30 bg-accent-green/[0.06] px-3.5 py-2 text-xs font-medium text-accent-green transition-all duration-200 hover:border-accent-green/50 hover:bg-accent-green/[0.10] sm:text-sm"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>新建任务</span>
        </button>
      ) : (
        <Link
          href="/?newTask=1"
          className="flex items-center gap-1.5 rounded-full border border-accent-green/30 bg-accent-green/[0.06] px-3.5 py-2 text-xs font-medium text-accent-green transition-all duration-200 hover:border-accent-green/50 hover:bg-accent-green/[0.10] sm:text-sm"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>新建任务</span>
        </Link>
      )}
      {buttons.map((b) => (
        <Link
          key={b.label}
          href={b.href}
          className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium transition-all duration-200 sm:text-sm ${
            active === b.key
              ? "border-accent-purple/35 bg-accent-purple/[0.08] text-text-primary"
              : "border-white/[0.07] bg-white/[0.03] text-text-secondary hover:border-white/[0.18] hover:text-text-primary"
          }`}
        >
          <b.icon className={`h-3.5 w-3.5 ${b.color}`} />
          <span>{b.label}</span>
        </Link>
      ))}
    </div>
  );
}
