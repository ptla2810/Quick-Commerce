'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export interface SelectedLocation {
  localityId: string;
  localityName: string;
  cityName: string;
  postalCode: string;
  lat: number;
  lng: number;
  addressId?: string | null;
  addressLabel?: string | null;
}

interface LocationCtx {
  location: SelectedLocation | null;
  ready: boolean;
  setLocation: (l: SelectedLocation | null) => void;
  /** Query string fragment for API calls, e.g. localityId=..&lat=..&lng=.. */
  query: string;
}

const KEY = 'padosi.location.v1';
const Ctx = createContext<LocationCtx | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const [location, setLoc] = useState<SelectedLocation | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setLoc(JSON.parse(raw));
    } catch {
      // ignore unreadable storage
    }
    setReady(true);
  }, []);

  const setLocation = useCallback((l: SelectedLocation | null) => {
    setLoc(l);
    try {
      if (l) localStorage.setItem(KEY, JSON.stringify(l));
      else localStorage.removeItem(KEY);
    } catch {
      // storage unavailable (private mode): keep in memory only
    }
  }, []);

  const query = location ? `localityId=${encodeURIComponent(location.localityId)}&lat=${location.lat}&lng=${location.lng}` : '';
  return <Ctx.Provider value={{ location, ready, setLocation, query }}>{children}</Ctx.Provider>;
}

export function useLocation() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useLocation outside LocationProvider');
  return c;
}
