import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken, getStoredUser, setStoredUser, User } from '@/src/api';

type Ctx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: { email: string; password: string; full_name: string; clinic_name: string }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (!token) { setLoading(false); return; }
      const cached = await getStoredUser();
      if (cached) setUser(cached);
      try {
        const fresh = await api.me();
        setUser(fresh);
        await setStoredUser(fresh);
      } catch {
        await setToken(null);
        await setStoredUser(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.login({ email, password });
    await setToken(res.access_token);
    await setStoredUser(res.user);
    setUser(res.user);
  };

  const register = async (payload: { email: string; password: string; full_name: string; clinic_name: string }) => {
    const res = await api.register(payload);
    await setToken(res.access_token);
    await setStoredUser(res.user);
    setUser(res.user);
  };

  const logout = async () => {
    await setToken(null);
    await setStoredUser(null);
    setUser(null);
  };

  const refresh = async () => {
    try {
      const fresh = await api.me();
      setUser(fresh);
      await setStoredUser(fresh);
    } catch { /* noop */ }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}
