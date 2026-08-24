"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import MainLayout from "@/components/layout/main-layout";
import ConsoleHeader from "@/components/console-header";
import QuickActionBar from "@/components/quick-action-bar";

export default function WorkspaceShell({
  active,
  kicker,
  title,
  description,
  action,
  children,
}: {
  active: "today" | "inbox" | "review" | "search" | "projects" | "ideas" | "reading" | "week";
  kicker: string;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <MainLayout>
      <ConsoleHeader />
      <div className="mb-6 flex flex-col gap-4 border-b border-white/[0.07] pb-5 lg:flex-row lg:items-center lg:justify-between">
        <QuickActionBar active={active} />
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 rounded-full border border-accent-green/30 bg-accent-green/10 px-4 py-2.5 text-sm font-medium text-accent-green transition-colors hover:border-accent-green/55 hover:bg-accent-green/15"
        >
          <ArrowLeft className="h-4 w-4" />
          返回今日总览
        </Link>
      </div>
      <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-[10px] font-medium tracking-[0.28em] text-accent-green">
            {kicker}
          </p>
          <h2 className="text-2xl font-semibold text-text-primary">{title}</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-text-muted">{description}</p>
        </div>
        {action}
      </header>
      {children}
    </MainLayout>
  );
}
