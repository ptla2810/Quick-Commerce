import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, loadToken, setToken } from './api';

export interface User {
  id: string;
  name: string;
  roles: string[];
  deliveryPartner: { id: string; verificationStatus: string; isOnline: boolean } | null;
}

const Ctx = createContext<{ ready: boolean; user: User | null; signIn: (t: string, u: User) => Promise<void>; signOut: () => Promise<void> } | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    (async () => {
      try {
        if (await loadToken()) setUser((await api<{ user: User }>('/auth/me')).user);
      } catch {
        await setToken(null);
      } finally {
        setReady(true);
      }
    })();
  }, []);
  const signIn = useCallback(async (t: string, u: User) => {
    await setToken(t);
    setUser(u);
  }, []);
  const signOut = useCallback(async () => {
    await api('/auth/logout', { body: {} }).catch(() => {});
    await setToken(null);
    setUser(null);
  }, []);
  return <Ctx.Provider value={{ ready, user, signIn, signOut }}>{children}</Ctx.Provider>;
}

export function useSession() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSession outside SessionProvider');
  return c;
}
