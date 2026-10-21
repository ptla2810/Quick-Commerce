'use client';

import type { ReactNode } from 'react';
import { PortalShell } from './shells';
import { useAuth } from './providers/auth';

export function AdminShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const can = (p: string) => !!user?.permissions.includes(p);
  const nav = [
    { href: '/admin', label: 'Dashboard', p: 'admin:dashboard' },
    { href: '/admin/sellers', label: 'Sellers', p: 'admin:sellers' },
    { href: '/admin/orders', label: 'Orders & dispatch', p: 'admin:orders' },
    { href: '/admin/people', label: 'Customers, B2B & riders', p: 'admin:users' },
    { href: '/admin/zones', label: 'Cities & zones', p: 'admin:zones' },
    { href: '/admin/catalog', label: 'Catalogue', p: 'admin:catalog' },
    { href: '/admin/coupons', label: 'Coupons', p: 'admin:coupons' },
    { href: '/admin/support', label: 'Support & returns', p: 'admin:support' },
    { href: '/admin/settlements', label: 'Settlements', p: 'admin:settlements' },
    { href: '/admin/settings', label: 'Settings', p: 'admin:settings' },
    { href: '/admin/audit', label: 'Audit log', p: 'admin:audit' },
  ].filter((n) => can(n.p));
  return (
    <PortalShell portal="admin" title="Admin" nav={nav} roles={['ADMIN', 'SUPER_ADMIN']}>
      {children}
    </PortalShell>
  );
}
