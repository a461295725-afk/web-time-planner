"use client";

import { CounterData } from "@/lib/mock-data";

interface Props {
  counters: CounterData[];
  activeKey: string | null;
  onFilter: (key: string | null) => void;
}

const counterTheme: Record<string, { accent: string; glow: string }> = {
  todayCheckins: { accent: "bg-accent-green/10 border-accent-green/30 text-accent-green", glow: "shadow-[0_0_14px_rgba(156,255,109,0.12)]" },
  todayTasks: { accent: "bg-accent-green/10 border-accent-green/30 text-accent-green", glow: "shadow-[0_0_14px_rgba(156,255,109,0.12)]" },
  weekTasks: { accent: "bg-accent-purple/10 border-accent-purple/30 text-accent-purple", glow: "shadow-[0_0_14px_rgba(165,180,252,0.12)]" },
  overdue: { accent: "bg-red-400/10 border-red-400/25 text-red-300", glow: "shadow-[0_0_14px_rgba(248,113,113,0.12)]" },
};

const counterActive: Record<string, string> = {
  todayCheckins: "bg-accent-green border-accent-green text-[#10120d]",
  todayTasks: "bg-accent-green border-accent-green text-[#10120d]",
  weekTasks: "bg-accent-purple border-accent-purple text-[#101116]",
  overdue: "bg-red-400 border-red-400 text-[#101116]",
};

export default function HUDCounterBar({ counters, activeKey, onFilter }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:gap-2.5">
      {counters.map((c) => {
        const isActive = activeKey === c.key;
        const theme = counterTheme[c.key] ?? counterTheme.weekTasks;
        const activeStyle = counterActive[c.key] ?? counterActive.weekTasks;

        return (
          <button
            key={c.key}
            onClick={() => onFilter(isActive ? null : c.key)}
            className={`group relative flex min-h-[50px] items-center gap-2.5 rounded-xl border px-3.5 py-2.5 transition-all duration-300 sm:min-h-[54px] lg:gap-3 ${
              isActive
                ? `${activeStyle} ${theme.glow} scale-[1.03]`
                : `${theme.accent} hover:border-opacity-60 hover:scale-[1.01]`
            }`}
          >
            <span className={`text-2xl font-bold tabular-nums leading-none tracking-tight sm:text-[26px] lg:text-[30px] ${isActive ? "opacity-90" : ""}`}>
              {c.count}
            </span>
            <span className={`text-[10px] font-semibold uppercase tracking-[0.12em] sm:text-[11px] ${isActive ? "opacity-75" : "opacity-80"}`}>
              {c.label}
            </span>
            {isActive && (
              <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-white/70 shadow-[0_0_6px_rgba(255,255,255,0.4)]" />
            )}
          </button>
        );
      })}
    </div>
  );
}
