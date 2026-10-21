'use client';

import type { ReactNode } from 'react';
import { PortalShell } from './shells';
import { useCart } from './providers/cart';

export function BusinessShell({ children }: { children: ReactNode }) {
  const { businessCart } = useCart();
  return (
    <PortalShell
      portal="business"
      title="HoReCa Business"
      nav={[
        { href: '/business', label: 'Dashboard' },
        { href: '/business/catalogue', label: 'Bulk catalogue' },
        { href: '/cart?mode=BUSINESS', label: 'Cart', badge: businessCart?.itemCount },
        { href: '/business/lists', label: 'Saved lists' },
        { href: '/business/rfq', label: 'Quotations (RFQ)' },
        { href: '/business/orders', label: 'Orders & invoices' },
      ]}
    >
      {children}
    </PortalShell>
  );
}
