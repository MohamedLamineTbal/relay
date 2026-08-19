"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { clearStoredToken, getStoredToken, storeToken } from "@/lib/api-client";
import type { Workspace } from "@/lib/types";

type Auth = { ready: boolean; workspace: Workspace | null; login: (email: string, password: string) => Promise<void>; register: (email: string, password: string) => Promise<void>; logout: () => void; refreshWorkspace: () => Promise<void> };
const Context = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false); const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const router = useRouter(); const pathname = usePathname();
  const refreshWorkspace = async () => { const data = await api.workspace(); setWorkspace(data); };
  useEffect(() => { let active = true; (async () => { if (getStoredToken()) { try { const w = await api.workspace(); if (active) setWorkspace(w); } catch { clearStoredToken(); } } if (active) setReady(true); })(); return () => { active = false; }; }, []);
  useEffect(() => {
    if (!ready) return;
    const isPublic = pathname === "/login" || pathname.startsWith("/pay/") || pathname === "/payments/success" || pathname === "/payments/cancel";
    if (!workspace && !isPublic) router.replace("/login");
    if (workspace && pathname === "/login") router.replace("/");
  }, [ready, workspace, pathname, router]);
  const login = async (email: string, password: string) => { const result = await api.login({ email, password }); storeToken(result.accessToken, result.expiresIn); await refreshWorkspace(); router.replace("/"); };
  const register = async (email: string, password: string) => { await api.register({ email, password }); await login(email, password); };
  const logout = () => { clearStoredToken(); setWorkspace(null); router.replace("/login"); };
  return <Context.Provider value={{ ready, workspace, login, register, logout, refreshWorkspace }}>{children}</Context.Provider>;
}
export function useAuth() { const value = useContext(Context); if (!value) throw new Error("useAuth must be used within AuthProvider"); return value; }
