'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ORDER_STATUSES } from '@padosi/shared';
import { AdminShell } from '@/components/admin';
import { useApi } from '@/lib/api';
import { money } from '@/components/commerce';
import { Badge, Button, Input, PageTitle, Select, Spinner, StatusBadge, ErrorState } from '@/components/ui';

interface Row {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  vertical: string;
  channel: string;
  fulfilmentType: string;
  grandTotal: number;
  placedAt: string;
  storeName: string;
  customerName: string;
}

export default function AdminOrdersPage() {
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<{ orders: Row[]; total: number }>(`/admin/orders?page=${page}${status ? `&status=${status}` : ''}${query ? `&q=${encodeURIComponent(query)}` : ''}`);
  return (
    <AdminShell>
      <PageTitle title="Orders & dispatch" />
      <form className="mb-4 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); setQuery(q); setPage(1); }}>
        <div className="w-56">
          <Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ').toLowerCase()}
              </option>
            ))}
          </Select>
        </div>
        <Input label="Order number" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      {loading && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-navy-100">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-navy-50 text-left text-xs uppercase">
              <tr>
                <th className="p-3">Order</th>
                <th className="p-3">Store</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Type</th>
                <th className="p-3">Placed</th>
                <th className="p-3">Status</th>
                <th className="p-3">Payment</th>
                <th className="p-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {data.orders.map((o) => (
                <tr key={o.id}>
                  <td className="p-3">
                    <Link href={`/admin/orders/${o.id}`} className="font-semibold text-brand-700 hover:underline">
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className="p-3">{o.storeName}</td>
                  <td className="p-3">{o.customerName}</td>
                  <td className="p-3">
                    <Badge tone="gray">{o.vertical.toLowerCase()}</Badge> {o.fulfilmentType === 'PICKUP' && <Badge tone="orange">pickup</Badge>}
                  </td>
                  <td className="p-3">{new Date(o.placedAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td className="p-3">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="p-3 text-xs">
                    {o.paymentMethod.replace('_', ' ')} · {o.paymentStatus.replace('_', ' ').toLowerCase()}
                  </td>
                  <td className="p-3 text-right tabular-nums">{money(o.grandTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between p-3 text-sm">
            <span>{data.total} orders</span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <Button size="sm" variant="secondary" disabled={page * 30 >= data.total} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
