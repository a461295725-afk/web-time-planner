"use client";

import { FormEvent, useState } from "react";
import { HabitItem } from "@/lib/mock-data";
import {
  BookOpen,
  Check,
  ClipboardCheck,
  Dumbbell,
  Flower2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { motion } from "framer-motion";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  dumbbell: Dumbbell,
  "clipboard-check": ClipboardCheck,
  "book-open": BookOpen,
  "flower-2": Flower2,
};

interface Props {
  habits: HabitItem[];
  onToggle: (id: string) => void;
  onCreate: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function HabitCheckInBar({
  habits,
  onToggle,
  onCreate,
  onRename,
  onDelete,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");

  const beginEditing = () => {
    setDraftNames(
      Object.fromEntries(habits.map((habit) => [habit.id, habit.name]))
    );
    setEditing(true);
  };

  const addHabit = async (event: FormEvent) => {
    event.preventDefault();
    if (!newName.trim()) return;
    await onCreate(newName.trim());
    setNewName("");
  };

  return (
    <div className="flex flex-col items-start gap-2 lg:items-end">
      <div className="flex flex-wrap gap-2">
        {habits.map((habit) => {
          const Icon = iconMap[habit.icon] || ClipboardCheck;
          return (
            <motion.button
              key={habit.id}
              whileTap={{ scale: 0.92 }}
              onClick={() => onToggle(habit.id)}
              className={`relative flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition-all duration-200 sm:text-sm ${
                habit.checked
                  ? "border-accent-green/50 bg-accent-green/[0.08] text-accent-green shadow-[0_0_14px_rgba(156,255,109,0.15)]"
                  : "border-white/[0.07] bg-white/[0.03] text-text-muted hover:border-text-muted/50 hover:text-text-secondary"
              }`}
            >
              <motion.span
                animate={{ scale: habit.checked ? [1, 1.25, 1] : 1 }}
                transition={{ duration: 0.3 }}
              >
                <Icon className="h-3.5 w-3.5" />
              </motion.span>
              <span>{habit.name}</span>
              {habit.checked && (
                <Check className="ml-0.5 h-3 w-3" />
              )}
            </motion.button>
          );
        })}
        <button
          onClick={editing ? () => setEditing(false) : beginEditing}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition-all duration-200 sm:text-sm ${
            editing
              ? "border-accent-purple/35 bg-accent-purple/[0.08] text-accent-purple"
              : "border-white/[0.07] bg-white/[0.03] text-text-muted hover:text-text-primary"
          }`}
        >
          {editing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          {editing ? "收起" : "编辑打卡"}
        </button>
      </div>
      {editing && (
        <div className="w-full min-w-[300px] rounded-2xl border border-white/[0.08] bg-card/70 p-3 backdrop-blur-sm lg:max-w-[480px]">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
            编辑每日打卡
          </p>
          <div className="space-y-2">
            {habits.map((habit) => (
              <form
                key={habit.id}
                onSubmit={(event) => {
                  event.preventDefault();
                  void onRename(habit.id, draftNames[habit.id] ?? habit.name);
                }}
                className="flex items-center gap-2"
              >
                <input
                  value={draftNames[habit.id] ?? habit.name}
                  onChange={(event) =>
                    setDraftNames((current) => ({
                      ...current,
                      [habit.id]: event.target.value,
                    }))
                  }
                  className="min-w-0 flex-1 rounded-lg border border-white/[0.07] bg-black/25 px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent-green/25"
                />
                <button
                  aria-label="保存打卡名称"
                  className="rounded-lg border border-accent-green/20 bg-accent-green/[0.06] p-2 text-accent-green transition-colors hover:border-accent-green/40"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="删除打卡项目"
                  onClick={() => void onDelete(habit.id)}
                  className="rounded-lg border border-white/[0.06] p-2 text-text-muted transition-colors hover:border-red-400/30 hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </form>
            ))}
          </div>
          <form onSubmit={addHabit} className="mt-3 flex items-center gap-2 border-t border-white/[0.06] pt-3">
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="新增打卡，例如：早睡"
              className="min-w-0 flex-1 rounded-lg border border-accent-green/[0.12] bg-accent-green/[0.03] px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted transition-colors focus:border-accent-green/30"
            />
            <button className="flex items-center gap-1 rounded-lg bg-accent-green px-3 py-2 text-sm font-medium text-[#10120d] hover:brightness-110">
              <Plus className="h-4 w-4" />
              新增
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
