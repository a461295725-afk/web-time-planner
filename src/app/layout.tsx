import type { Metadata } from "next";
import GlobalCommandPalette from "@/components/global-command-palette";
import { AuthGuard } from "@/lib/auth-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Time Planner",
  description: "个人事项管理看板与 AI Agent 枢纽",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <AuthGuard>
          {children}
          <GlobalCommandPalette />
        </AuthGuard>
      </body>
    </html>
  );
}
