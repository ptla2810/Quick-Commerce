'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { PortalShell } from './shells';
import { useAuth } from './providers/auth';
import { EmptyState, LinkButton, Notice, VerificationBadge } from './ui';

interface SellerStore {
  id: string;
  name: string;
  slug: string;
  verticals: string[];
  orgId: string;
  orgName: string;
  orgStatus: string;
  role: string;
}

const Ctx = createContext<{ store: SellerStore | null; stores: SellerStore[]; setStoreId: (id: string) => void } | null>(null);
const KEY = 'padosi.seller.store';

export function useSellerStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSellerStore outside SellerShell');
  return c;
}

function StorePicker() {
  const { store, stores, setStoreId } = useSellerStore();
  if (stores.length < 2) return null;
  return (
    <label className="mb-4 flex items-center gap-2 text-sm">
      <span className="font-semibold">Store:</span>
      <select className="rounded-lg border-0 ring-1 ring-navy-100" value={store?.id} onChange={(e) => setStoreId(e.target.value)}>
        {stores.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.role.toLowerCase()})
          </option>
        ))}
      </select>
    </label>
  );
}

export function SellerShell({ children, allowWithoutStore }: { children: ReactNode; allowWithoutStore?: boolean }) {
  const { user } = useAuth();
  const stores: SellerStore[] =
    user?.sellerMemberships.flatMap((m) => m.org.stores.map((s) => ({ ...s, orgId: m.org.id, orgName: m.org.name, orgStatus: m.org.verificationStatus, role: m.role }))) ?? [];
  const [storeId, setStoreIdState] = useState<string | null>(null);
  useEffect(() => {
    try {
      setStoreIdState(localStorage.getItem(KEY));
    } catch {
      // ignore
    }
  }, []);
  const setStoreId = (id: string) => {
    setStoreIdState(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // ignore
    }
  };
  const store = stores.find((s) => s.id === storeId) ?? stores[0] ?? null;
  const isPharmacist = store?.role === 'PHARMACIST';
  const nav = [
    { href: '/seller', label: 'Dashboard' },
    { href: '/seller/orders', label: 'Orders' },
    { href: '/seller/inventory', label: 'Inventory' },
    ...(store?.verticals.includes('HORECA') ? [{ href: '/seller/rfqs', label: 'RFQs' }] : []),
    ...(store && ['OWNER', 'MANAGER'].includes(store.role) ? [{ href: '/seller/finance', label: 'Payouts & returns' }, { href: '/seller/settings', label: 'Store settings' }] : []),
  ];

  return (
    <PortalShell portal="seller" title={isPharmacist ? 'Pharmacist' : 'Seller'} nav={nav}>
      <Ctx.Provider value={{ store, stores, setStoreId }}>
        {!store && !allowWithoutStore ? (
          <EmptyState icon="🏪" title="You don’t have a store yet" body="Register your shop to start selling to customers nearby." action={<LinkButton href="/seller/onboarding">Register your shop</LinkButton>} />
        ) : (
          <>
            <StorePicker />
            {store && store.orgStatus !== 'APPROVED' && (
              <div className="mb-4">
                <Notice tone="orange" title="Verification in progress">
                  <span className="flex items-center gap-2">
                    {store.orgName}: <VerificationBadge status={store.orgStatus} />
                  </span>
                  Your store is hidden from customers until approved. You can set up inventory meanwhile.
                </Notice>
              </div>
            )}
            {children}
          </>
        )}
      </Ctx.Provider>
    </PortalShell>
  );
}
