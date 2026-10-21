'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Cart } from '@/lib/types';
import { useAuth } from './auth';
import { useToast } from './toast';

interface SetItemArgs {
  storeId: string;
  variantId: string;
  quantity: number;
  mode?: 'RETAIL' | 'BUSINESS';
  storeName?: string;
}

interface CartCtx {
  cart: Cart | null;
  businessCart: Cart | null;
  refresh: () => Promise<void>;
  setItem: (a: SetItemArgs) => Promise<boolean>;
  quantityOf: (variantId: string, mode?: 'RETAIL' | 'BUSINESS') => number;
  pending: string | null;
}

const Ctx = createContext<CartCtx | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const toast = useToast();
  const [cart, setCart] = useState<Cart | null>(null);
  const [businessCart, setBusinessCart] = useState<Cart | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setCart(null);
      setBusinessCart(null);
      return;
    }
    const [r, b] = await Promise.all([
      api<{ cart: Cart | null }>('/cart?mode=RETAIL').catch(() => ({ cart: null })),
      user.businessProfile ? api<{ cart: Cart | null }>('/cart?mode=BUSINESS').catch(() => ({ cart: null })) : Promise.resolve({ cart: null }),
    ]);
    setCart(r.cart);
    setBusinessCart(b.cart);
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setItem = useCallback(
    async ({ storeId, variantId, quantity, mode = 'RETAIL' }: SetItemArgs) => {
      if (!user) {
        toast.show('Sign in to add items to your cart', 'info');
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        return false;
      }
      setPending(variantId);
      const send = (replaceCart: boolean) => api<{ cart: Cart | null }>('/cart/items', { body: { storeId, variantId, quantity, mode, replaceCart } });
      try {
        let r: { cart: Cart | null };
        try {
          r = await send(false);
        } catch (e) {
          if (e instanceof ApiError && e.code === 'CART_STORE_CONFLICT') {
            if (!window.confirm(`${e.message}\n\nClear your cart and start a new one with this store?`)) return false;
            r = await send(true);
          } else throw e;
        }
        if (mode === 'BUSINESS') setBusinessCart(r.cart);
        else setCart(r.cart);
        return true;
      } catch (e) {
        toast.show((e as Error).message, 'error');
        return false;
      } finally {
        setPending(null);
      }
    },
    [user, toast],
  );

  const quantityOf = useCallback(
    (variantId: string, mode: 'RETAIL' | 'BUSINESS' = 'RETAIL') => (mode === 'BUSINESS' ? businessCart : cart)?.items.find((i) => i.variantId === variantId)?.quantity ?? 0,
    [cart, businessCart],
  );

  return <Ctx.Provider value={{ cart, businessCart, refresh, setItem, quantityOf, pending }}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCart outside CartProvider');
  return c;
}
