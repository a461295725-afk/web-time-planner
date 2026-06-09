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
    loading: true,
  });

  const checkSession = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/session");
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
      setState({ authenticated: false, needsSetup: false, loading: false });
    }
  }, []);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  // Redirect logic: run after session check
  useEffect(() => {
    if (state.loading) return;
    if (state.authenticated && PUBLIC_PATHS.includes(pathname)) {
      router.replace("/");
      return;
    }
    if (!state.authenticated && !PUBLIC_PATHS.includes(pathname)) {
      if (state.needsSetup) {
        router.replace("/setup");
      } else {
        router.replace("/login");
      }
    }
  }, [
    state.loading,
    state.authenticated,
    state.needsSetup,
    pathname,
    router,
  ]);

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

  // On public pages, show nothing while loading (avoids flash of login form)
  if (state.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary">
        <div className="h-2 w-2 rounded-full bg-accent-green animate-ping" />
      </div>
    );
  }

  // On public pages, render children directly (login/setup don't need auth)
  if (PUBLIC_PATHS.includes(pathname)) {
    return (
      <AuthContext.Provider value={{ ...state, login, logout, register, setup }}>
        {children}
      </AuthContext.Provider>
    );
  }

  // On protected pages, only render if authenticated
  if (!state.authenticated) return null;

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
