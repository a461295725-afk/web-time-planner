"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter, usePathname } from "next/navigation";

interface AuthState {
  authenticated: boolean;
  userId?: string;
  username?: string;
  isAdmin?: boolean;
  needsSetup: boolean;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  register: (
    username: string,
    password: string
  ) => Promise<{ error?: string }>;
  setup: (
    username: string,
    password: string
  ) => Promise<{ error?: string }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PUBLIC_PATHS = ["/login", "/setup"];

export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<AuthState>({
    authenticated: false,
    needsSetup: false,
    // Start with loading=false so we never show a spinner that can hang forever.
    // Session is checked in background; if we have a cookie, we redirect.
    loading: false,
  });
  const [initialCheckDone, setInitialCheckDone] = useState(false);

  const checkSession = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch("/api/auth/session", {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await response.json();
      setState({
        authenticated: data.authenticated,
        userId: data.userId,
        username: data.username,
        isAdmin: data.isAdmin,
        needsSetup: data.needsSetup,
        loading: false,
      });
      return data;
    } catch {
      // Silently fail — user sees login page
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    void checkSession().then(() => setInitialCheckDone(true));
  }, [checkSession]);

  // After initial check: redirect based on auth state
  useEffect(() => {
    if (!initialCheckDone) return;
    if (state.authenticated && PUBLIC_PATHS.includes(pathname)) {
      router.replace("/");
    } else if (!state.authenticated && !PUBLIC_PATHS.includes(pathname)) {
      if (state.needsSetup) {
        router.replace("/setup");
      } else {
        router.replace("/login");
      }
    }
  }, [initialCheckDone, state.authenticated, state.needsSetup, pathname, router]);

  const login = async (username: string, password: string) => {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (response.ok) {
        await checkSession();
        router.replace("/");
        return {};
      }
      const data = await response.json();
      return { error: data.error ?? "登录失败" };
    } catch {
      return { error: "无法连接服务器" };
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setState({ authenticated: false, needsSetup: false, loading: false });
    router.replace("/login");
  };

  const register = async (username: string, password: string) => {
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (response.ok) return {};
      const data = await response.json();
      return { error: data.error ?? "创建失败" };
    } catch {
      return { error: "无法连接服务器" };
    }
  };

  const setup = async (username: string, password: string) => {
    try {
      const response = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (response.ok) {
        await checkSession();
        router.replace("/");
        return {};
      }
      const data = await response.json();
      return { error: data.error ?? "初始化失败" };
    } catch {
      return { error: "无法连接服务器" };
    }
  };

  // Always render content immediately — no blocking loading spinner.
  // Session check happens in background.
  //
  // For protected pages: if we know we're not authenticated (and check is done),
  // show nothing to avoid flash of error states while redirect is in flight.
  if (initialCheckDone && !state.authenticated && !PUBLIC_PATHS.includes(pathname)) {
    return null;
  }

  return (
    <AuthContext.Provider value={{ ...state, login, logout, register, setup }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthGuard");
  return ctx;
}
