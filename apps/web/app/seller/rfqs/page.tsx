'use client';

import { useState } from 'react';
import { SellerShell, useSellerStore } from '@/components/seller';
import { useToast } from '@/components/providers/toast';
import { api, useApi } from '@/lib/api';
import { money } from '@/components/commerce';
import { Badge, Button, Card, Checkbox, EmptyState, ErrorState, Input, Modal, PageTitle, Spinner } from '@/components/ui';

interface Rfq {
  id: string;
  rfqNumber: string;
  title: string;
  notes: string | null;
  status: string;
  neededBy: string | null;
  businessProfile: { businessName: string; businessType: string };
  deliveryLocality: { name: string };
  items: { id: string; description: string; quantity: string; unit: string; variantId: string | null; variant: { sku: string; name: string; product: { name: string; taxRateBps: number } } | null }[];
  quotations: { id: string; status: string; grandTotal: number; validUntil: string }[];
}

function QuoteModal({ rfq, storeId, onClose, onDone }: { rfq: Rfq; storeId: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [lines, setLines] = useState(rfq.items.map((i) => ({ rfqItemId: i.id, price: '', gst: String((i.variant?.product.taxRateBps ?? 500) / 100), available: true })));
  const [validDays, setValidDays] = useState('3');
  const [fee, setFee] = useState('0');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const total = lines.reduce((s, l, i) => (l.available ? s + Math.round(Number(l.price || 0) * 100) * Number(rfq.items[i].quantity) * (1 + Number(l.gst) / 100) : s), 0) + Math.round(Number(fee) * 100);
  return (
    <Modal open onClose={onClose} title={`Quote for ${rfq.rfqNumber}`}>
      <div className="space-y-3">
        {rfq.items.map((it, i) => (
          <div key={it.id} className="rounded-xl bg-navy-50 p-3">
            <p className="text-sm font-semibold">
              {it.description} — {Number(it.quantity)} {it.unit}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Input label="Unit price ₹ (excl. GST)" inputMode="decimal" value={lines[i].price} onChange={(e) => setLines(lines.map((l, k) => (k === i ? { ...l, price: e.target.value } : l)))} disabled={!lines[i].available} />
              <Input label="GST %" inputMode="decimal" value={lines[i].gst} onChange={(e) => setLines(lines.map((l, k) => (k === i ? { ...l, gst: e.target.value } : l)))} />
            </div>
            <div className="mt-2">
              <Checkbox label="I can supply this item" checked={lines[i].available} onChange={(v) => setLines(lines.map((l, k) => (k === i ? { ...l, available: v } : l)))} />
            </div>
          </div>
        ))}
        <div className="grid grid-cols-2 gap-2">
          <Input label="Delivery fee ₹" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
          <Input label="Valid for (days)" inputMode="numeric" value={validDays} onChange={(e) => setValidDays(e.target.value)} />
        </div>
        <Input label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <p className="text-sm font-semibold">Estimated total incl. GST: {money(total)}</p>
        <Button
          block
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api(`/seller/rfqs/${rfq.id}/quotations`, {
                body: {
                  storeId,
                  validUntil: new Date(Date.now() + Number(validDays || 1) * 86400_000).toISOString(),
                  deliveryFee: Math.round(Number(fee || 0) * 100),
                  notes: notes || null,
                  items: lines.map((l) => ({ rfqItemId: l.rfqItemId, unitPrice: Math.round(Number(l.price || 0) * 100), taxRateBps: Math.round(Number(l.gst) * 100), available: l.available })),
                },
              });
              toast.show('Quotation sent');
              onDone();
            } catch (e) {
              toast.show((e as Error).message, 'error');
            } finally {
              setBusy(false);
            }
          }}
        >
          Send quotation
        </Button>
      </div>
    </Modal>
  );
}

function RfqsInner() {
  const { store } = useSellerStore();
  const { data, error, loading, reload } = useApi<{ rfqs: Rfq[] }>(store ? `/seller/stores/${store.id}/rfqs` : null);
  const [quoting, setQuoting] = useState<Rfq | null>(null);
  return (
    <>
      <PageTitle title="Requests for quotation" subtitle="Business buyers in your delivery area asking for prices" />
      {loading && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data?.rfqs.length === 0 && <EmptyState icon="📨" title="No open RFQs in your area" />}
      <div className="grid gap-3 lg:grid-cols-2">
        {data?.rfqs.map((r) => (
          <Card key={r.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{r.title}</p>
                <p className="text-xs text-navy-700/80">
                  {r.rfqNumber} · {r.businessProfile.businessName} ({r.businessProfile.businessType.toLowerCase()}) · {r.deliveryLocality.name}
                  {r.neededBy && ` · by ${new Date(r.neededBy).toLocaleDateString('en-IN')}`}
                </p>
              </div>
              {r.quotations[0] ? <Badge tone={r.quotations[0].status === 'ACCEPTED' ? 'green' : 'blue'}>Quoted {money(r.quotations[0].grandTotal)} · {r.quotations[0].status.toLowerCase()}</Badge> : <Badge tone="orange">Awaiting your quote</Badge>}
            </div>
            <ul className="mt-2 text-sm">
              {r.items.map((i) => (
                <li key={i.id}>
                  • {i.description} — {Number(i.quantity)} {i.unit}
                </li>
              ))}
            </ul>
            {r.notes && <p className="mt-1 text-sm text-navy-700/80">Note: {r.notes}</p>}
            {(!r.quotations[0] || r.quotations[0].status === 'SUBMITTED') && (
              <Button className="mt-3" size="sm" onClick={() => setQuoting(r)}>
                {r.quotations[0] ? 'Revise quotation' : 'Send quotation'}
              </Button>
            )}
          </Card>
        ))}
      </div>
      {quoting && <QuoteModal rfq={quoting} storeId={store!.id} onClose={() => setQuoting(null)} onDone={() => { setQuoting(null); void reload(); }} />}
    </>
  );
}

export default function SellerRfqsPage() {
  return (
    <SellerShell>
      <RfqsInner />
    </SellerShell>
  );
}
