import { ReactNode } from "react";

export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen px-3 pb-16 pt-3 text-text-primary sm:px-4 sm:pb-20 sm:pt-4 lg:px-6">
      <div className="mx-auto min-h-[calc(100vh-1.5rem)] max-w-[1520px] rounded-[22px] border border-white/[0.05] bg-bg-secondary/80 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-sm sm:min-h-[calc(100vh-2rem)] sm:rounded-[26px] sm:p-5 lg:p-6">
        {children}
      </div>
    </main>
  );
}
