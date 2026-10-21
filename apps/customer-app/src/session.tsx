import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api, loadToken, setToken } from './api';

export interface User {
  id: string;
  name: string;
  phone: string | null;
  roles: string[];
}
export interface Loc {
  localityId: string;
  localityName: string;
  cityName: string;
  postalCode: string;
  lat: number;
  lng: number;
}

interface SessionCtx {
  ready: boolean;
  user: User | null;
  location: Loc | null;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
  setLocation: (l: Loc) => Promise<void>;
  locQuery: string;
}

const Ctx = createContext<SessionCtx | null>(null);
const LOC_KEY = 'padosi.location';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [location, setLoc] = useState<Loc | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(LOC_KEY);
        if (raw) setLoc(JSON.parse(raw));
        if (await loadToken()) {
          const me = await api<{ user: User }>('/auth/me');
          setUser(me.user);
        }
      } catch {
        await setToken(null);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const signIn = useCallback(async (token: string, u: User) => {
    await setToken(token);
    setUser(u);
  }, []);
  const signOut = useCallback(async () => {
    await api('/auth/logout', { body: {} }).catch(() => {});
    await setToken(null);
    setUser(null);
  }, []);
  const setLocation = useCallback(async (l: Loc) => {
    setLoc(l);
    await SecureStore.setItemAsync(LOC_KEY, JSON.stringify(l));
  }, []);
  const locQuery = location ? `localityId=${encodeURIComponent(location.localityId)}&lat=${location.lat}&lng=${location.lng}` : '';
  return <Ctx.Provider value={{ ready, user, location, signIn, signOut, setLocation, locQuery }}>{children}</Ctx.Provider>;
}

export function useSession() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSession outside SessionProvider');
  return c;
}
