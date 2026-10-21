'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { UNIT_TYPES } from '@padosi/shared';
import { BusinessShell } from '@/components/business';
import { useLocation } from '@/components/providers/location';
import { useAuth } from '@/components/providers/auth';
import { api, ApiError, useApi } from '@/lib/api';
import { useCitiesAndLocalities } from '@/components/address';
import { Button, Card, Input, Notice, PageTitle, Select, Textarea } from '@/components/ui';
import type { ProductCard } from '@/lib/types';

interface Line {
  variantId: string;
  description: string;
  quantity: string;
  unit: string;
}

export default function NewRfqPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { location, query } = useLocation();
  const { localities } = useCitiesAndLocalities();
  const products = useApi<{ items: ProductCard[] }>(location ? `/catalog/products?${query}&vertical=HORECA&pageSize=100` : null);
  const skus = products.data?.items.flatMap((p) => p.variants.map((v) => ({ id: v.id, label: `${p.name} – ${v.name}`, unit: v.unitType }))) ?? [];
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const [localityId, setLocalityId] = useState(location?.localityId ?? '');
  const [lines, setLines] = useState<Line[]>([{ variantId: '', description: '', quantity: '1', unit: 'KG' }]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const update = (i: number, patch: Partial<Line>) => setLines(lines.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const verified = user?.businessProfile?.verificationStatus === 'APPROVED';

  return (
    <BusinessShell>
      <PageTitle title="New request for quotation" back="/business/rfq" />
      {!verified && (
        <div className="mb-4">
          <Notice tone="orange">RFQs are available once your business account is verified.</Notice>
        </div>
      )}
      <Card>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            try {
              const r = await api<{ rfq: { id: string } }>('/business/rfqs', {
                body: {
                  title,
                  notes: notes || null,
                  neededBy: neededBy ? new Date(neededBy).toISOString() : null,
                  deliveryLocalityId: localityId,
                  items: lines.map((l) => ({ variantId: l.variantId || null, description: l.description || skus.find((s) => s.id === l.variantId)?.label || '', quantity: Number(l.quantity), unit: l.unit })),
                },
              });
              router.push(`/business/rfq/${r.rfq.id}`);
            } catch (e) {
              setErr((e as ApiError).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Wedding catering – 300 guests" />
            <Select label="Deliver to" value={localityId} onChange={(e) => setLocalityId(e.target.value)} required>
              <option value="">Choose area…</option>
              {localities.data?.localities.filter((l) => l.serviceable).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
            <Input label="Needed by (optional)" type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
          </div>
          <fieldset className="space-y-3">
            <legend className="font-semibold">Items</legend>
            {lines.map((l, i) => (
              <div key={i} className="grid gap-2 rounded-xl bg-navy-50 p-3 sm:grid-cols-[2fr_2fr_1fr_1fr_auto] sm:items-end">
                <Select label="Catalogue item" value={l.variantId} onChange={(e) => update(i, { variantId: e.target.value, unit: skus.find((s) => s.id === e.target.value)?.unit ?? l.unit })}>
                  <option value="">Other / not listed</option>
                  {skus.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </Select>
                <Input label="Description" value={l.description} onChange={(e) => update(i, { description: e.target.value })} required={!l.variantId} placeholder="Brand, grade, size…" />
                <Input label="Quantity" inputMode="decimal" value={l.quantity} onChange={(e) => update(i, { quantity: e.target.value })} required />
                <Select label="Unit" value={l.unit} onChange={(e) => update(i, { unit: e.target.value })}>
                  {UNIT_TYPES.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </Select>
                <Button type="button" variant="ghost" aria-label={`Remove item ${i + 1}`} onClick={() => setLines(lines.filter((_, k) => k !== i))} disabled={lines.length === 1}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={() => setLines([...lines, { variantId: '', description: '', quantity: '1', unit: 'KG' }])}>
              <Plus className="h-4 w-4" aria-hidden /> Add item
            </Button>
          </fieldset>
          <Textarea label="Notes for suppliers (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery timing, quality grade, packaging…" />
          {err && <Notice tone="red">{err}</Notice>}
          <Button type="submit" loading={busy} disabled={!verified}>
            Send to suppliers
          </Button>
        </form>
      </Card>
    </BusinessShell>
  );
}
