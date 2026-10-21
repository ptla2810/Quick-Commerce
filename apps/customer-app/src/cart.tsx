import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Alert } from 'react-native';
import { api, ApiError } from './api';
import { useSession } from './session';

export interface CartItem {
  id: string;
  variantId: string;
  quantity: number;
  productName: string;
  variantName: string;
  unitPrice: number | null;
  lineTotal: number | null;
  stockStatus: string;
  maxQuantity: number;
  minOrderQty: number;
  requiresPrescription: boolean;
}
export interface Cart {
  store: { id: string; name: string; minOrderValue: number };
  items: CartItem[];
  itemCount: number;
  estimatedSubtotal: number;
  requiresPrescription: boolean;
}

const Ctx = createContext<{ cart: Cart | null; refresh: () => Promise<void>; setItem: (storeId: string, variantId: string, qty: number) => Promise<void>; qtyOf: (variantId: string) => number; busy: string | null } | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const [cart, setCart] = useState<Cart | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!user) return setCart(null);
    const r = await api<{ cart: Cart | null }>('/cart?mode=RETAIL').catch(() => ({ cart: null }));
    setCart(r.cart);
  }, [user]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setItem = useCallback(async (storeId: string, variantId: string, quantity: number) => {
    setBusy(variantId);
    const send = (replaceCart: boolean) => api<{ cart: Cart | null }>('/cart/items', { body: { storeId, variantId, quantity, replaceCart } });
    try {
      const r = await send(false);
      setCart(r.cart);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'CART_STORE_CONFLICT') {
        Alert.alert('Start a new cart?', `${e.message} Clear your cart and add this item?`, [
          { text: 'Keep current cart', style: 'cancel' },
          { text: 'Clear and add', style: 'destructive', onPress: async () => setCart((await send(true)).cart) },
        ]);
      } else Alert.alert('Could not update cart', (e as Error).message);
    } finally {
      setBusy(null);
    }
  }, []);
  const qtyOf = useCallback((v: string) => cart?.items.find((i) => i.variantId === v)?.quantity ?? 0, [cart]);
  return <Ctx.Provider value={{ cart, refresh, setItem, qtyOf, busy }}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCart outside CartProvider');
  return c;
}
