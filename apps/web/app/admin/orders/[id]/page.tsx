'use client';

import { use, useState } from 'react';
import { AdminShell } from '@/components/admin';
import { useToast } from '@/components/providers/toast';
import { api, useApi } from '@/lib/api';
import { money, OrderTimeline, PriceLine } from '@/components/commerce';
import { Badge, Button, Card, ErrorState, Input, PageTitle, Select, Spinner, StatusBadge } from '@/components/ui';
import type { OrderDetail } from '@/lib/types';

export default function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ order: OrderDetail; partners: { id: string; name: string; vehicleType: string; activeDeliveries: number }[] }>(`/admin/orders/${id}`);
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [partner, setPartner] = useState('');
  const [busy, setBusy] = useState(false);
  const act = async (path: string, body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await api(path, { body });
      toast.show('Updated');
      setTo('');
      setReason('');
      await reload();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <AdminShell>
      {loading && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <>
          <PageTitle title={`Order ${data.order.orderNumber}`} back="/admin/orders" subtitle={<span className="flex gap-2"><StatusBadge status={data.order.status} /><Badge tone="gray">{data.order.paymentMethod} · {data.order.paymentStatus.toLowerCase()}</Badge></span>} />
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="space-y-4">
              <Card>
                <h2 className="mb-2 font-semibold">Items</h2>
                <ul className="divide-y divide-navy-100 text-sm">
                  {data.order.items.map((i) => (
                    <li key={i.id} className="flex justify-between py-2">
                      <span>
                        {i.quantity} × {i.productName} ({i.variantName}) {i.requiresPrescription && <Badge tone="orange">Rx</Badge>}
                      </span>
                      <span className="tabular-nums">{money(i.netAmount)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card>
                <h2 className="mb-2 font-semibold">Timeline</h2>
                <OrderTimeline status={data.order.status} events={data.order.events} fulfilmentType={data.order.fulfilmentType} />
                <ul className="mt-2 space-y-1 text-xs text-navy-700/80">
                  {data.order.events.map((e, i) => (
                    <li key={i}>
                      {new Date(e.at).toLocaleString('en-IN')} · {e.actorType.toLowerCase()} → {e.toStatus.toLowerCase()} {e.note && `(${e.note})`}
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
            <aside className="space-y-4">
              <Card className="space-y-1">
                <PriceLine label="Customer paid" value={money(data.order.totals.grandTotal)} strong />
                <PriceLine label="Commission" value={money(data.order.totals.commissionAmount)} />
                <PriceLine label="Seller earning" value={money(data.order.totals.sellerEarning)} />
                <p className="text-xs text-navy-700/70">Store: {data.order.store.name}</p>
              </Card>
              <Card className="space-y-2">
                <h2 className="font-semibold">Override status</h2>
                <Select label="Move to" value={to} onChange={(e) => setTo(e.target.value)}>
                  <option value="">Choose…</option>
                  {data.order.actions.nextStatuses.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, ' ').toLowerCase()}
                    </option>
                  ))}
                </Select>
                <Input label="Reason (audited)" value={reason} onChange={(e) => setReason(e.target.value)} />
                <Button block disabled={!to || reason.length < 3} loading={busy} onClick={() => act(`/admin/orders/${id}/transition`, { to, reason })}>
                  Apply
                </Button>
              </Card>
              {data.order.fulfilmentType === 'DELIVERY' && ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'DELIVERY_FAILED'].includes(data.order.status) && (
                <Card className="space-y-2">
                  <h2 className="font-semibold">Manual dispatch</h2>
                  {data.order.delivery && <p className="text-sm">Current: {data.order.delivery.partnerName} ({data.order.delivery.status.toLowerCase()})</p>}
                  <Select label="Delivery partner" value={partner} onChange={(e) => setPartner(e.target.value)}>
                    <option value="">Choose…</option>
                    {data.partners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.activeDeliveries} active
                      </option>
                    ))}
                  </Select>
                  <Button block variant="secondary" disabled={!partner} loading={busy} onClick={() => act(`/admin/orders/${id}/assign`, { deliveryPartnerId: partner })}>
                    Assign
                  </Button>
                </Card>
              )}
            </aside>
          </div>
        </>
      )}
    </AdminShell>
  );
}
