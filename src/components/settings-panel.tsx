"use client";

import { useEffect, useState } from "react";
import {
  Check,
  KeyRound,
  LoaderCircle,
  LogOut,
  Settings,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react";
import {
  AiProvider,
  defaultSettings,
  PublicSettings,
  themeOptions,
} from "@/lib/settings";
import { useAuth } from "@/lib/auth-context";

const defaultsByProvider: Record<AiProvider, { model: string; url: string }> = {
  openai: {
    model: "gpt-4.1-mini",
    url: "https://api.openai.com/v1/responses",
  },
  anthropic: {
    model: "claude-sonnet-4-20250514",
    url: "https://api.anthropic.com/v1/messages",
  },
  compatible: {
    model: "your-model",
    url: "https://your-provider.example/v1/chat/completions",
  },
};

const blankSettings: PublicSettings = {
  ...defaultSettings,
  aiKeyConfigured: false,
};

export default function SettingsPanel() {
  const { isAdmin, logout, register } = useAuth();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<PublicSettings>(blankSettings);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState("");

  // Create user state
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [createNotice, setCreateNotice] = useState("");

  const load = async () => {
    const response = await fetch("/api/settings", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as PublicSettings;
    setSettings(data);
    document.documentElement.dataset.theme = data.theme;
  };

  useEffect(() => {
    void load();
  }, []);

  const patchSettings = async (next: Partial<PublicSettings>) => {
    setSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (response.ok) {
        const data = (await response.json()) as PublicSettings;
        setSettings(data);
        document.documentElement.dataset.theme = data.theme;
        setNotice("设置已保存");
      } else {
        setNotice("设置保存失败");
      }
    } catch {
      setNotice("设置保存失败，请检查服务器连接");
    } finally {
      setSaving(false);
    }
  };

  const testAi = async () => {
    setTesting(true);
    setNotice("");
    try {
      const response = await fetch("/api/ai/test", { method: "POST" });
      const result = await response.json();
      setNotice(response.ok ? "AI 连接成功" : result.error ?? "AI 连接失败");
    } catch {
      setNotice("AI 连接失败，请检查服务器连接");
    } finally {
      setTesting(false);
    }
  };

  const handleCreateUser = async () => {
    setCreating(true);
    setCreateNotice("");
    const result = await register(newUsername, newPassword);
    if (result.error) {
      setCreateNotice(result.error);
    } else {
      setCreateNotice(`用户 "${newUsername}" 创建成功`);
      setNewUsername("");
      setNewPassword("");
    }
    setCreating(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="打开设置"
        className="rounded-full border border-card-border bg-card/70 p-2 text-text-secondary transition-colors hover:border-accent-green/30 hover:text-accent-green"
      >
        <Settings className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside className="fixed bottom-3 right-3 top-3 z-[61] w-[min(92vw,470px)] overflow-y-auto rounded-[26px] border border-white/10 bg-bg-secondary p-5 shadow-[-18px_0_60px_rgba(0,0,0,0.5)] sm:bottom-5 sm:right-5 sm:top-5 sm:p-6">
            <header className="mb-6 flex items-start justify-between">
              <div>
                <p className="mb-2 text-[10px] tracking-[0.25em] text-accent-green">
                  PREFERENCES
                </p>
                <h2 className="text-xl font-semibold">设置</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="关闭设置"
                className="rounded-xl border border-card-border p-2 text-text-muted hover:text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            {/* 配色主题 */}
            <section className="mb-6">
              <h3 className="mb-3 text-sm font-medium text-text-primary">
                配色主题
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {themeOptions.map((theme) => (
                  <button
                    key={theme.key}
                    onClick={() => void patchSettings({ theme: theme.key })}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      settings.theme === theme.key
                        ? "border-accent-green/40 bg-accent-green/[0.07]"
                        : "border-white/[0.07] bg-card/45 hover:border-white/15"
                    }`}
                  >
                    <div className="mb-2 flex gap-1.5">
                      <span
                        className="h-3.5 w-3.5 rounded-full"
                        style={{ background: theme.primary }}
                      />
                      <span
                        className="h-3.5 w-3.5 rounded-full"
                        style={{ background: theme.secondary }}
                      />
                    </div>
                    <p className="text-xs font-medium text-text-primary">
                      {theme.name}
                    </p>
                    <p className="mt-1 text-[10px] leading-4 text-text-muted">
                      {theme.description}
                    </p>
                  </button>
                ))}
              </div>
            </section>

            {/* AI 设置 */}
            <section className="mb-6 rounded-2xl border border-white/[0.08] bg-card/40 p-4">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="h-4 w-4 text-accent-purple" />
                  AI 拆分任务
                </h3>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] ${
                    settings.aiKeyConfigured
                      ? "bg-accent-green/10 text-accent-green"
                      : "bg-white/[0.05] text-text-muted"
                  }`}
                >
                  {settings.aiKeyConfigured ? "服务器 Key 已配置" : "未配置 Key"}
                </span>
              </div>
              <label className="mb-3 block text-xs text-text-muted">
                服务商
                <select
                  value={settings.aiProvider}
                  onChange={(event) => {
                    const provider = event.target.value as AiProvider;
                    const defaults = defaultsByProvider[provider];
                    void patchSettings({
                      aiProvider: provider,
                      aiModel: defaults.model,
                      aiBaseUrl: defaults.url,
                    });
                  }}
                  className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-text-primary outline-none"
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic / Claude</option>
                  <option value="compatible">OpenAI 兼容接口</option>
                </select>
              </label>
              <label className="mb-3 block text-xs text-text-muted">
                模型名称
                <input
                  value={settings.aiModel}
                  onChange={(event) =>
                    setSettings({ ...settings, aiModel: event.target.value })
                  }
                  onBlur={() =>
                    void patchSettings({ aiModel: settings.aiModel })
                  }
                  className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-text-primary outline-none"
                />
              </label>
              <label className="mb-3 block text-xs text-text-muted">
                API 地址
                <input
                  value={settings.aiBaseUrl}
                  onChange={(event) =>
                    setSettings({ ...settings, aiBaseUrl: event.target.value })
                  }
                  onBlur={() =>
                    void patchSettings({ aiBaseUrl: settings.aiBaseUrl })
                  }
                  className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-text-primary outline-none"
                />
              </label>
              <div className="mb-4 flex items-start gap-2 rounded-xl bg-black/20 p-3 text-[11px] leading-5 text-text-muted">
                <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-green" />
                <span>
                  API Key 不在页面中保存。部署到服务器时请配置环境变量{" "}
                  <span className="text-text-secondary">AI_API_KEY</span>。
                  公开访问前，请先为应用加登录或访问限制。
                </span>
              </div>
              <button
                onClick={testAi}
                disabled={!settings.aiKeyConfigured || testing}
                className="flex items-center gap-2 rounded-full border border-accent-purple/25 bg-accent-purple/10 px-4 py-2 text-xs text-accent-purple disabled:cursor-not-allowed disabled:opacity-45"
              >
                {testing ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                测试 AI 连接
              </button>
            </section>

            {/* 默认行为 */}
            <section className="mb-6 rounded-2xl border border-white/[0.08] bg-card/40 p-4">
              <h3 className="mb-4 text-sm font-medium">默认行为</h3>
              <label className="mb-4 block text-xs text-text-muted">
                新任务默认优先级
                <select
                  value={settings.defaultPriority}
                  onChange={(event) =>
                    void patchSettings({
                      defaultPriority: event.target.value as "P1" | "P2" | "P3",
                    })
                  }
                  className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-text-primary outline-none"
                >
                  <option value="P1">P1 - 高优先</option>
                  <option value="P2">P2 - 常规</option>
                  <option value="P3">P3 - 低优先</option>
                </select>
              </label>
              <PreferenceSwitch
                label="新建项目子任务自动加入本周计划"
                checked={settings.autoAddProjectTaskToWeek}
                onToggle={() =>
                  void patchSettings({
                    autoAddProjectTaskToWeek:
                      !settings.autoAddProjectTaskToWeek,
                  })
                }
              />
              <PreferenceSwitch
                label="想法转为任务时自动安排到今日"
                checked={settings.autoScheduleConvertedIdea}
                onToggle={() =>
                  void patchSettings({
                    autoScheduleConvertedIdea:
                      !settings.autoScheduleConvertedIdea,
                  })
                }
              />
            </section>

            {/* Hermes API Token */}
            <section className="mb-6 rounded-2xl border border-white/[0.08] bg-card/40 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
                <svg className="h-4 w-4 text-accent-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                </svg>
                Hermes 外部访问 Token
              </h3>
              <p className="mb-3 text-[11px] leading-5 text-text-muted">
                微信机器人通过此 Token 访问你的工作台，在请求头中携带 <span className="text-text-secondary">X-API-Token</span>。
                每个用户有独立的 Token，请妥善保管。
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={settings.hermesApiToken || "尚未生成"}
                  className="flex-1 rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-xs text-text-secondary outline-none font-mono"
                />
                <button
                  onClick={() => {
                    const token =
                      settings.hermesApiToken ||
                      [...Array(32)]
                        .map(() => Math.random().toString(36)[2])
                        .join("");
                    if (!settings.hermesApiToken) {
                      void patchSettings({ hermesApiToken: token });
                    }
                    navigator.clipboard
                      ?.writeText(settings.hermesApiToken || token)
                      .then(() => setNotice("Token 已复制"));
                  }}
                  className="shrink-0 rounded-full border border-accent-green/25 bg-accent-green/[0.06] px-3 py-2 text-xs text-accent-green"
                >
                  复制
                </button>
                <button
                  onClick={() => {
                    const token = [...Array(32)]
                      .map(() => Math.random().toString(36)[2])
                      .join("");
                    void patchSettings({ hermesApiToken: token });
                    setNotice("Token 已重新生成");
                  }}
                  className="shrink-0 rounded-full border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-xs text-text-secondary"
                >
                  重置
                </button>
              </div>
              {settings.hermesApiToken && (
                <div className="mt-3 rounded-xl bg-black/20 p-3 text-[10px] leading-5 text-text-muted">
                  <p className="mb-1 font-medium text-text-secondary">使用示例：</p>
                  <code className="block break-all text-accent-green">
                    curl -H "X-API-Token: {settings.hermesApiToken}" {typeof window !== "undefined" ? window.location.origin : ""}/api/v1/tasks/dashboard
                  </code>
                </div>
              )}
            </section>

            {/* 管理员：创建用户 */}
            {isAdmin && (
              <section className="mb-6 rounded-2xl border border-accent-purple/20 bg-accent-purple/[0.03] p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <UserPlus className="h-4 w-4 text-accent-purple" />
                  创建新用户
                </h3>
                <div className="flex flex-col gap-3">
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="新用户名"
                    className="w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-text-primary outline-none"
                  />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="设置密码（至少6位）"
                    className="w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-sm text-text-primary outline-none"
                  />
                  <button
                    onClick={handleCreateUser}
                    disabled={
                      creating || !newUsername || newPassword.length < 6
                    }
                    className="mt-1 flex items-center justify-center gap-2 rounded-full border border-accent-purple/25 bg-accent-purple/10 px-4 py-2 text-xs text-accent-purple disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    {creating ? "创建中..." : "创建用户"}
                  </button>
                  {createNotice && (
                    <p
                      className={`text-xs ${
                        createNotice.includes("成功")
                          ? "text-accent-green"
                          : "text-red-400"
                      }`}
                    >
                      {createNotice}
                    </p>
                  )}
                </div>
              </section>
            )}

            {/* 退出登录 */}
            <section className="mb-6 rounded-2xl border border-white/[0.08] bg-card/40 p-4">
              <button
                onClick={() => {
                  void logout();
                  setOpen(false);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-red-400/25 bg-red-400/[0.06] px-4 py-2.5 text-sm text-red-400 transition-colors hover:bg-red-400/10"
              >
                <LogOut className="h-4 w-4" />
                退出登录
              </button>
            </section>

            {(notice || saving) && (
              <p className="mt-4 text-xs text-accent-green">
                {saving ? "正在保存..." : notice}
              </p>
            )}
          </aside>
        </>
      )}
    </>
  );
}

function PreferenceSwitch({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="mb-3 flex w-full items-center justify-between gap-3 text-left text-sm text-text-secondary"
    >
      {label}
      <span
        className={`flex h-6 w-11 shrink-0 items-center rounded-full px-1 transition-colors ${
          checked ? "justify-end bg-accent-green" : "justify-start bg-white/10"
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full ${
            checked ? "bg-[#10120d]" : "bg-text-muted"
          }`}
        >
          {checked && <Check className="h-4 w-4" />}
        </span>
      </span>
    </button>
  );
}
