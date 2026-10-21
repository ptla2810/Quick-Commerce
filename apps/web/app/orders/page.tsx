'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AppShell, RequireAuth } from '@/components/shells';
import { useApi } from '@/lib/api';
import { money } from '@/components/commerce';
import { Badge, EmptyState, ErrorState, LinkButton, PageTitle, Spinner, StatusBadge, Tabs } from '@/components/ui';

interface OrderRow {
  id: string;
  orderNumber: string;
  status: string;
  channel: string;
  vertical: string;
  grandTotal: number;
  placedAt: string;
  store: { name: string };
  itemCount: number;
  preview: string[];
}

function OrdersInner() {
  const [scope, setScope] = useState<'all' | 'active' | 'past'>('all');
  const { data, error, loading, reload } = useApi<{ orders: OrderRow[]; total: number }>(`/orders?scope=${scope}`);
  return (
    <>
      <Tabs
        value={scope}
        onChange={setScope}
        options={[
          { value: 'all', label: 'All' },
          { value: 'active', label: 'Active' },
          { value: 'past', label: 'Completed' },
        ]}
      />
      <div className="mt-4 space-y-3">
        {loading && <Spinner />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {data?.orders.length === 0 && <EmptyState icon="📦" title="No orders yet" body="Your orders will appear here." action={<LinkButton href="/">Start shopping</LinkButton>} />}
        {data?.orders.map((o) => (
          <Link key={o.id} href={`/orders/${o.id}`} className="block rounded-2xl bg-white p-4 ring-1 ring-navy-100/70 hover:ring-brand-500">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="font-semibold">{o.store.name}</p>
                {o.channel === 'BUSINESS' && <Badge tone="navy">Business</Badge>}
                {o.vertical === 'CHEMIST' && <Badge tone="blue">Chemist</Badge>}
              </div>
              <StatusBadge status={o.status} />
            </div>
            <p className="mt-1 truncate text-sm text-navy-700/80">{o.preview.join(', ')}{o.itemCount > o.preview.length ? ` +${o.itemCount - o.preview.length} more` : ''}</p>
            <p className="mt-1 text-xs text-navy-700/70">
              {o.orderNumber} · {new Date(o.placedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · <span className="font-semibold text-navy-900">{money(o.grandTotal)}</span>
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}

export default function OrdersPage() {
  return (
    <AppShell>
      <PageTitle title="My orders" />
      <RequireAuth message="Sign in to see your orders.">
        <OrdersInner />
      </RequireAuth>
    </AppShell>
  );
}
