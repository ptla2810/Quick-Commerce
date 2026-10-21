'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { BusinessShell } from '@/components/business';
import { useToast } from '@/components/providers/toast';
import { api, useApi } from '@/lib/api';
import { money } from '@/components/commerce';
import { Badge, Button, Card, DemoBadge, ErrorState, Notice, PageTitle, Spinner } from '@/components/ui';

interface Rfq {
  id: string;
  rfqNumber: string;
  title: string;
  status: string;
  notes: string | null;
  neededBy: string | null;
  deliveryLocality: { name: string };
  items: { id: string; description: string; quantity: string; unit: string; variant: { sku: string; name: string } | null }[];
  quotations: {
    id: string;
    status: string;
    validUntil: string;
    expired: boolean;
    deliveryFee: number;
    notes: string | null;
    subtotal: number;
    taxTotal: number;
    grandTotal: number;
    store: { id: string; name: string; ratingAvg: number; isDemo: boolean };
    items: { rfqItemId: string; unitPrice: number; taxRateBps: number; available: boolean }[];
  }[];
}

export default function RfqDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, loading, reload } = useApi<{ rfq: Rfq }>(`/business/rfqs/${id}`);
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<{ storeSlug: string; negotiatedItems: number; unmatchedItems: number } | null>(null);

  if (loading) return <BusinessShell><Spinner /></BusinessShell>;
  if (error) return <BusinessShell><ErrorState error={error} onRetry={reload} /></BusinessShell>;
  if (!data) return null;
  const r = data.rfq;
  const open = ['OPEN', 'QUOTED'].includes(r.status);
  const valid = r.quotations.filter((q) => !q.expired && q.status !== 'WITHDRAWN');
  const cheapest = valid.length ? Math.min(...valid.map((q) => q.grandTotal)) : null;

  return (
    <BusinessShell>
      <PageTitle
        title={r.title}
        back="/business/rfq"
        subtitle={`${r.rfqNumber} · deliver to ${r.deliveryLocality.name}${r.neededBy ? ` · needed by ${new Date(r.neededBy).toLocaleDateString('en-IN')}` : ''}`}
        action={
          open ? (
            <Button variant="ghost" className="!text-red-700" onClick={async () => { await api(`/business/rfqs/${r.id}/cancel`, { body: {} }); void reload(); }}>
              Cancel RFQ
            </Button>
          ) : (
            <Badge>{r.status.toLowerCase()}</Badge>
          )
        }
      />
      {accepted && (
        <div className="mb-4">
          <Notice tone="green" title="Quotation accepted">
            Negotiated prices are now active for {accepted.negotiatedItems} item(s) at this supplier.
            {accepted.unmatchedItems > 0 && ` ${accepted.unmatchedItems} custom item(s) will be arranged directly by the supplier.`}{' '}
            <Link href={`/business/catalogue`} className="font-semibold underline">
              Order now at negotiated prices
            </Link>
          </Notice>
        </div>
      )}
      {r.quotations.length === 0 && <Notice>Waiting for suppliers to respond. You will be notified when a quotation arrives.</Notice>}
      {r.quotations.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="p-3 text-left font-semibold">Compare quotations (prices exclude GST unless shown)</caption>
            <thead className="bg-navy-50 text-left text-xs uppercase text-navy-700">
              <tr>
                <th className="p-3">Item</th>
                {r.quotations.map((q) => (
                  <th key={q.id} className="p-3">
                    {q.store.name} {q.store.isDemo && <DemoBadge />}
                    <span className="block font-normal normal-case">★ {q.store.ratingAvg.toFixed(1)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {r.items.map((it) => {
                const prices = r.quotations.map((q) => q.items.find((x) => x.rfqItemId === it.id));
                const best = Math.min(...prices.filter((p) => p?.available).map((p) => p!.unitPrice));
                return (
                  <tr key={it.id}>
                    <td className="p-3">
                      {it.description}
                      <span className="block text-xs text-navy-700/70">
                        {Number(it.quantity)} × {it.unit}
                        {it.variant && ` · ${it.variant.sku}`}
                      </span>
                    </td>
                    {prices.map((p, k) => (
                      <td key={k} className={`p-3 tabular-nums ${p?.available && p.unitPrice === best ? 'font-bold text-brand-700' : ''}`}>
                        {!p ? '—' : !p.available ? 'Not available' : `${money(p.unitPrice)} / unit`}
                      </td>
                    ))}
                  </tr>
                );
              })}
              <tr>
                <td className="p-3">Delivery fee</td>
                {r.quotations.map((q) => (
                  <td key={q.id} className="p-3 tabular-nums">{q.deliveryFee ? money(q.deliveryFee) : 'Free'}</td>
                ))}
              </tr>
              <tr className="bg-navy-50 font-semibold">
                <td className="p-3">Total incl. GST</td>
                {r.quotations.map((q) => (
                  <td key={q.id} className="p-3 tabular-nums">
                    {money(q.grandTotal)} {q.grandTotal === cheapest && <Badge tone="green">Lowest</Badge>}
                    <span className="block text-xs font-normal">GST {money(q.taxTotal)}</span>
                  </td>
                ))}
              </tr>
              <tr>
                <td className="p-3">Validity & notes</td>
                {r.quotations.map((q) => (
                  <td key={q.id} className="p-3 text-xs">
                    {q.expired ? <Badge tone="red">Expired</Badge> : `Valid till ${new Date(q.validUntil).toLocaleDateString('en-IN')}`}
                    {q.notes && <span className="mt-1 block">{q.notes}</span>}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="p-3" />
                {r.quotations.map((q) => (
                  <td key={q.id} className="p-3">
                    {q.status === 'ACCEPTED' ? (
                      <Badge tone="green">Accepted</Badge>
                    ) : q.status === 'REJECTED' ? (
                      <Badge tone="gray">Not selected</Badge>
                    ) : open && !q.expired ? (
                      <Button
                        size="sm"
                        loading={busy === q.id}
                        onClick={async () => {
                          if (!window.confirm(`Accept the quotation from ${q.store.name}? Other quotations will be declined.`)) return;
                          setBusy(q.id);
                          try {
                            const res = await api<{ storeSlug: string; negotiatedItems: number; unmatchedItems: number }>(`/business/quotations/${q.id}/accept`, { body: {} });
                            setAccepted(res);
                            void reload();
                          } catch (e) {
                            toast.show((e as Error).message, 'error');
                          } finally {
                            setBusy(null);
                          }
                        }}
                      >
                        Accept
                      </Button>
                    ) : null}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </Card>
      )}
      {r.notes && <p className="mt-4 text-sm text-navy-700/80">Your notes: {r.notes}</p>}
    </BusinessShell>
  );
}
