'use client';

import Link from 'next/link';
import { BusinessShell } from '@/components/business';
import { useToast } from '@/components/providers/toast';
import { api, useApi } from '@/lib/api';
import { money } from '@/components/commerce';
import { Button, EmptyState, ErrorState, PageTitle, Spinner, StatusBadge } from '@/components/ui';

interface Row {
  id: string;
  orderNumber: string;
  status: string;
  grandTotal: number;
  placedAt: string;
  store: { name: string };
  itemCount: number;
}

export default function BusinessOrdersPage() {
  const { data, error, loading, reload } = useApi<{ orders: Row[] }>('/orders?channel=BUSINESS');
  const toast = useToast();
  return (
    <BusinessShell>
      <PageTitle title="Orders & invoices" subtitle="GST invoices are issued by the supplier once an order is delivered." />
      {loading && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data?.orders.length === 0 && <EmptyState icon="🧾" title="No business orders yet" />}
      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-navy-100">
        <table className="w-full text-sm">
          <thead className="bg-navy-50 text-left text-xs uppercase text-navy-700">
            <tr>
              <th className="p-3">Order</th>
              <th className="p-3">Supplier</th>
              <th className="p-3">Date</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Total</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-100">
            {data?.orders.map((o) => (
              <tr key={o.id}>
                <td className="p-3">
                  <Link href={`/orders/${o.id}`} className="font-semibold text-brand-700 hover:underline">
                    {o.orderNumber}
                  </Link>
                </td>
                <td className="p-3">{o.store.name}</td>
                <td className="p-3">{new Date(o.placedAt).toLocaleDateString('en-IN')}</td>
                <td className="p-3">
                  <StatusBadge status={o.status} />
                </td>
                <td className="p-3 text-right tabular-nums">{money(o.grandTotal)}</td>
                <td className="flex flex-wrap gap-2 p-3">
                  {o.status === 'DELIVERED' && (
                    <Link href={`/orders/${o.id}/invoice`} className="text-sm font-semibold text-brand-700 underline">
                      Invoice
                    </Link>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await api(`/business/lists/from-order/${o.id}`, { body: { name: `From ${o.orderNumber}` } });
                      toast.show('Saved as a procurement list');
                    }}
                  >
                    Save as list
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </BusinessShell>
  );
}
