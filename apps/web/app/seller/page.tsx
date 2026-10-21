'use client';

import Link from 'next/link';
import { SellerShell, useSellerStore } from '@/components/seller';
import { useApi } from '@/lib/api';
import { money } from '@/components/commerce';
import { Card, ErrorState, PageTitle, SectionHeader, Spinner, Stat } from '@/components/ui';

interface Analytics {
  periodDays: number;
  totalSales: number;
  totalOrders: number;
  deliveredOrders: number;
  averageOrderValue: number;
  ordersByStatus: Record<string, number>;
  acceptanceRate: number | null;
  fulfilmentRate: number | null;
  cancellations: number;
  rejections: number;
  returns: number;
  bestSellers: { variantId: string; name: string; quantity: number; sales: number }[];
  outOfStock: { inventoryId: string; name: string; sku: string }[];
  lowStockCount: number;
  estimatedEarnings: number;
  commissionPaid: number;
  pendingSettlement: number;
}

const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);

function Dashboard() {
  const { store } = useSellerStore();
  const { data, error, loading, reload } = useApi<Analytics>(store ? `/seller/stores/${store.id}/analytics?days=30` : null);
  const newOrders = (data?.ordersByStatus.PLACED ?? 0) + (data?.ordersByStatus.AWAITING_RX_REVIEW ?? 0);
  return (
    <>
      <PageTitle title={store!.name} subtitle="Last 30 days" />
      {loading && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <>
          {newOrders > 0 && (
            <Link href="/seller/orders" className="mb-4 flex items-center justify-between rounded-2xl bg-accent-500 p-4 font-semibold text-navy-900">
              <span>{newOrders} new order{newOrders > 1 ? 's' : ''} waiting for you</span>
              <span>Review →</span>
            </Link>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Total sales (delivered)" value={money(data.totalSales)} hint="Goods value incl. GST" />
            <Stat label="Orders" value={data.totalOrders} hint={`${data.deliveredOrders} delivered`} />
            <Stat label="Average order value" value={money(data.averageOrderValue)} />
            <Stat label="Estimated earnings" value={money(data.estimatedEarnings)} hint={`After ${money(data.commissionPaid)} commission`} tone="green" />
            <Stat label="Acceptance rate" value={pct(data.acceptanceRate)} />
            <Stat label="Fulfilment rate" value={pct(data.fulfilmentRate)} />
            <Stat label="Cancellations / rejections" value={`${data.cancellations} / ${data.rejections}`} hint={`${data.returns} return requests`} />
            <Stat label="Pending settlement" value={money(data.pendingSettlement)} />
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <SectionHeader title="Best sellers" />
              {data.bestSellers.length === 0 && <p className="text-sm text-navy-700/80">No sales yet in this period.</p>}
              <ol className="divide-y divide-navy-100 text-sm">
                {data.bestSellers.map((b, i) => (
                  <li key={b.variantId} className="flex justify-between gap-3 py-2">
                    <span>
                      {i + 1}. {b.name}
                    </span>
                    <span className="tabular-nums">
                      {b.quantity} sold · {money(b.sales)}
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
            <Card>
              <SectionHeader title="Stock alerts" action={<Link href="/seller/inventory" className="text-sm font-semibold text-brand-700">Manage</Link>} />
              <p className="mb-2 text-sm">{data.lowStockCount} item(s) running low.</p>
              {data.outOfStock.length === 0 ? (
                <p className="text-sm text-navy-700/80">Nothing is out of stock.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {data.outOfStock.map((o) => (
                    <li key={o.inventoryId} className="text-red-700">
                      Out of stock: {o.name} <span className="text-navy-700/60">({o.sku})</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}

export default function SellerHome() {
  return (
    <SellerShell>
      <Dashboard />
    </SellerShell>
  );
}
