import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, sessionStore, type Me } from './api';

interface AuthState {
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  canEdit: boolean;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>('/api/admin/me'));
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) console.error(e);
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onUnauth = () => setMe(null);
    window.addEventListener('ff:unauthenticated', onUnauth);
    return () => window.removeEventListener('ff:unauthenticated', onUnauth);
  }, [refresh]);

  const login = async (email: string, password: string) => {
    const r = await api<{ token?: string }>('/api/admin/auth/login', { method: 'POST', json: { email, password } });
    sessionStore.set(r.token ?? null);
    await refresh();
  };
  const logout = async () => {
    await api('/api/admin/auth/logout', { method: 'POST' }).catch(() => {});
    sessionStore.set(null);
    setMe(null);
  };

  return (
    <AuthCtx.Provider value={{ me, loading, login, logout, canEdit: me?.user.role === 'owner' || me?.user.role === 'editor' }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
