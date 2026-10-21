'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SellerShell, useSellerStore } from '@/components/seller';
import { useApi } from '@/lib/api';
import { money } from '@/components/commerce';
import { Badge, EmptyState, ErrorState, PageTitle, Spinner, StatusBadge, Tabs } from '@/components/ui';

interface Row {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  fulfilmentType: string;
  channel: string;
  grandTotal: number;
  itemCount: number;
  placedAt: string;
  scheduledFor: string | null;
  delivery: { status: string; partnerName: string } | null;
}

function OrdersInner() {
  const { store } = useSellerStore();
  const [scope, setScope] = useState<'new' | 'active' | 'completed' | 'all'>('active');
  const { data, error, loading, reload } = useApi<{ orders: Row[]; total: number }>(store ? `/seller/stores/${store.id}/orders?scope=${scope}` : null);
  useEffect(() => {
    const t = setInterval(() => void reload(), 20_000);
    return () => clearInterval(t);
  }, [reload]);
  return (
    <>
      <PageTitle title="Orders" subtitle="Refreshes automatically every 20 seconds" />
      <Tabs value={scope} onChange={setScope} options={[{ value: 'new', label: 'New' }, { value: 'active', label: 'In progress' }, { value: 'completed', label: 'Completed' }, { value: 'all', label: 'All' }]} />
      <div className="mt-4">
        {loading && !data && <Spinner />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {data?.orders.length === 0 && <EmptyState icon="📭" title="No orders here" />}
        <ul className="space-y-2">
          {data?.orders.map((o) => (
            <li key={o.id}>
              <Link href={`/seller/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white p-4 ring-1 ring-navy-100/70 hover:ring-brand-500">
                <div>
                  <p className="font-semibold">
                    {o.orderNumber} {o.channel === 'BUSINESS' && <Badge tone="navy">B2B</Badge>} {o.fulfilmentType === 'PICKUP' && <Badge tone="orange">Pickup</Badge>}
                  </p>
                  <p className="text-xs text-navy-700/80">
                    {new Date(o.placedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · {o.itemCount} items · {o.paymentMethod.replace('_', ' ')}
                    {o.scheduledFor && ` · scheduled ${new Date(o.scheduledFor).toLocaleString('en-IN')}`}
                    {o.delivery && ` · rider ${o.delivery.partnerName} (${o.delivery.status.toLowerCase()})`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold tabular-nums">{money(o.grandTotal)}</span>
                  <StatusBadge status={o.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

export default function SellerOrdersPage() {
  return (
    <SellerShell>
      <OrdersInner />
    </SellerShell>
  );
}
