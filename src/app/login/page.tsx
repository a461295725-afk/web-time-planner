"use client";

import { FormEvent, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { LogIn, Shield } from "lucide-react";

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);
    const result = await login(username, password);
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
      <div className="w-full max-w-sm rounded-[22px] border border-white/[0.08] bg-bg-secondary/80 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.4)] backdrop-blur-sm sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-green/10">
            <Shield className="h-5 w-5 text-accent-green" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-accent-green">
              欢迎回来
            </p>
            <h1 className="text-lg font-semibold text-text-primary">
              时间管理中枢
            </h1>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="block">
            <span className="text-xs text-text-secondary">用户名</span>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-green/40"
              placeholder="输入用户名"
            />
          </label>
          <label className="block">
            <span className="text-xs text-text-secondary">密码</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-green/40"
              placeholder="输入密码"
            />
          </label>
          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={submitting || !username || !password}
            className="mt-1 flex items-center justify-center gap-2 rounded-full border border-accent-green/30 bg-accent-green/[0.08] py-2.5 text-sm font-medium text-accent-green transition-colors hover:bg-accent-green/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <LogIn className="h-4 w-4" />
            {submitting ? "登录中..." : "登录"}
          </button>
        </form>
      </div>
    </div>
  );
}
