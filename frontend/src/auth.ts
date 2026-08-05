import React, { useEffect, useState, useCallback } from "react";
import { storage } from "@/src/utils/storage";
import { api, getToken, setToken as apiSetToken, clearToken } from "@/src/api";

type User = {
  id: string;
  phone: string;
  role: "customer" | "captain" | "admin";
  name?: string;
  photo?: string;
  is_online?: boolean;
  rating?: number;
  vehicle_number?: string;
  vehicle_type?: string;
  wallet_balance?: number;
  cash_in_hand?: number;
  total_earnings?: number;
  kyc_verified?: boolean;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  hasSeenOnboarding: boolean;
};

const ONBOARDING_KEY = "zipride_onboarded";

let listeners: ((s: AuthState) => void)[] = [];
let state: AuthState = { user: null, loading: true, hasSeenOnboarding: false };

function setState(next: Partial<AuthState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l(state));
}

export function useAuth() {
  const [s, setS] = useState<AuthState>(state);

  useEffect(() => {
    listeners.push(setS);
    return () => {
      listeners = listeners.filter((l) => l !== setS);
    };
  }, []);

  const login = useCallback(async (user: User, token: string) => {
    await apiSetToken(token);
    setState({ user });
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // ignore — proceed with local logout regardless
    }
    await clearToken();
    setState({ user: null });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await api.me();
      setState({ user: res.user });
      return res.user;
    } catch {
      setState({ user: null });
      return null;
    }
  }, []);

  const markOnboarded = useCallback(async () => {
    await storage.setItem<boolean>(ONBOARDING_KEY, true);
    setState({ hasSeenOnboarding: true });
  }, []);

  return { ...s, login, logout, refresh, markOnboarded };
}

export async function bootstrapAuth() {
  // Hard safety cap: never let auth bootstrap block the splash for more than 6s.
  // On the first launch (no token) this normally completes in <100ms.
  const safety = setTimeout(() => {
    if (state.loading) {
      setState({ user: null, loading: false, hasSeenOnboarding: state.hasSeenOnboarding });
    }
  }, 6000);
  try {
    const onboarded = await storage.getItem<boolean>(ONBOARDING_KEY, false);
    const token = await getToken();
    if (!token) {
      setState({ user: null, loading: false, hasSeenOnboarding: !!onboarded });
      return;
    }
    try {
      const res = await api.me();
      setState({ user: res.user, loading: false, hasSeenOnboarding: !!onboarded });
    } catch {
      await clearToken();
      setState({ user: null, loading: false, hasSeenOnboarding: !!onboarded });
    }
  } catch (e) {
    // Never leave loading=true — storage / native modules can throw on some devices
    console.warn("[auth] bootstrap failed, falling back to logged-out state", e);
    setState({ user: null, loading: false, hasSeenOnboarding: false });
  } finally {
    clearTimeout(safety);
  }
}
