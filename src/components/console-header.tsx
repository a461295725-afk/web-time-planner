"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, Search, User } from "lucide-react";
import { displayDate, todayKey } from "@/lib/date";
import SettingsPanel from "@/components/settings-panel";
import { useAuth } from "@/lib/auth-context";

export default function ConsoleHeader() {
  const [date, setDate] = useState<string | null>(null);
  const { username, logout } = useAuth();

  useEffect(() => {
    setDate(todayKey());
  }, []);

  return (
    <header className="mb-5 flex items-center justify-between border-b border-white/[0.07] pb-4 sm:mb-6">
      <Link href="/">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-accent-green">
          Home Console
        </p>
        <h1 className="text-lg font-semibold tracking-tight text-text-primary sm:text-xl">
          时间管理中枢
        </h1>
      </Link>
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden items-center gap-2 rounded-full border border-card-border bg-card/50 px-3 py-2 text-xs text-text-secondary sm:flex">
          <User className="h-3 w-3 text-accent-green" />
          {username}
        </div>
        <button
          onClick={() => window.dispatchEvent(new Event("time-planner:open-command"))}
          aria-label="打开全局搜索和快速收集"
          title="搜索和快速收集（Ctrl/Cmd+K）"
          className="rounded-full border border-card-border bg-card/70 p-2 text-text-secondary transition-colors hover:border-accent-green/35 hover:text-accent-green"
        >
          <Search className="h-4 w-4" />
        </button>
        <SettingsPanel />
        <button
          onClick={() => void logout()}
          aria-label="退出登录"
          className="rounded-full border border-card-border bg-card/70 p-2 text-text-secondary transition-colors hover:border-red-400/30 hover:text-red-400"
        >
          <LogOut className="h-4 w-4" />
        </button>
        <span className="hidden items-center gap-2 rounded-full border border-card-border bg-card/70 px-3 py-2 text-xs text-text-secondary sm:flex">
          {date ? displayDate(date) : "\u00a0"}
          <ChevronDown className="h-3 w-3" />
        </span>
      </div>
    </header>
  );
}
