import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { BackHandler } from 'react-native';

/** A minimal stack navigator: enough for this app, with Android back-button support. */
export type Route = { name: string; params?: Record<string, string> };

interface NavCtx {
  route: Route;
  push: (name: string, params?: Record<string, string>) => void;
  replace: (name: string, params?: Record<string, string>) => void;
  reset: (name: string, params?: Record<string, string>) => void;
  back: () => boolean;
  canGoBack: boolean;
}

const Ctx = createContext<NavCtx | null>(null);

export function NavProvider({ initial, children }: { initial: Route; children: (route: Route) => ReactNode }) {
  const [stack, setStack] = useState<Route[]>([initial]);
  const back = useCallback(() => {
    let handled = false;
    setStack((s) => {
      if (s.length > 1) {
        handled = true;
        return s.slice(0, -1);
      }
      return s;
    });
    return handled;
  }, []);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => back());
    return () => sub.remove();
  }, [back]);
  const value: NavCtx = {
    route: stack[stack.length - 1],
    push: (name, params) => setStack((s) => [...s, { name, params }]),
    replace: (name, params) => setStack((s) => [...s.slice(0, -1), { name, params }]),
    reset: (name, params) => setStack([{ name, params }]),
    back,
    canGoBack: stack.length > 1,
  };
  return <Ctx.Provider value={value}>{children(value.route)}</Ctx.Provider>;
}

export function useNav() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useNav outside NavProvider');
  return c;
}
