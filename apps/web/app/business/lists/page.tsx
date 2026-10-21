'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BusinessShell } from '@/components/business';
import { useCart } from '@/components/providers/cart';
import { useToast } from '@/components/providers/toast';
import { api, ApiError, useApi } from '@/lib/api';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Modal, Notice, PageTitle, Select, Spinner } from '@/components/ui';

interface List {
  id: string;
  name: string;
  recurrence: string;
  nextDueAt: string | null;
  store: { id: string; name: string };
  items: { variantId: string; quantity: number; variant: { sku: string; name: string; product: { name: string } } }[];
}

export default function ListsPage() {
  const { data, error, loading, reload } = useApi<{ lists: List[] }>('/business/lists');
  const { businessCart, refresh } = useCart();
  const toast = useToast();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [recurrence, setRecurrence] = useState('NONE');
  const [busy, setBusy] = useState<string | null>(null);

  const addToCart = async (l: List, replaceCart = false): Promise<void> => {
    setBusy(l.id);
    try {
      const r = await api<{ results: { ok: boolean; message?: string }[] }>('/cart/bulk', { body: { storeId: l.store.id, mode: 'BUSINESS', replaceCart, items: l.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })) } });
      await refresh();
      const failed = r.results.filter((x) => !x.ok).length;
      toast.show(failed ? `${r.results.length - failed} added, ${failed} unavailable` : 'All items added to cart', failed ? 'info' : 'success');
      router.push('/cart?mode=BUSINESS');
    } catch (e) {
      if ((e as ApiError).code === 'CART_STORE_CONFLICT' && window.confirm(`${(e as Error).message}\n\nReplace your business cart?`)) return addToCart(l, true);
      toast.show((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <BusinessShell>
      <PageTitle
        title="Saved lists & recurring orders"
        subtitle="Reorder your regular supplies in one tap. Recurring lists remind you when they are due; orders are never placed without your confirmation."
        action={businessCart && businessCart.items.length > 0 ? <Button onClick={() => setSaving(true)}>Save current cart as list</Button> : undefined}
      />
      {loading && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data?.lists.length === 0 && <EmptyState icon="📝" title="No saved lists" body="Add items to your business cart, then save it as a list. You can also save any past order from Orders & invoices." />}
      <div className="grid gap-3 md:grid-cols-2">
        {data?.lists.map((l) => (
          <Card key={l.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{l.name}</p>
                <p className="text-xs text-navy-700/80">
                  {l.store.name} · {l.items.length} items
                </p>
              </div>
              {l.recurrence !== 'NONE' && (
                <Badge tone="blue">
                  {l.recurrence.toLowerCase()}
                  {l.nextDueAt && ` · due ${new Date(l.nextDueAt).toLocaleDateString('en-IN')}`}
                </Badge>
              )}
            </div>
            <ul className="mt-2 text-sm text-navy-700/90">
              {l.items.map((i) => (
                <li key={i.variantId}>
                  {i.variant.product.name} ({i.variant.name}) × {i.quantity}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <Button size="sm" loading={busy === l.id} onClick={() => addToCart(l)}>
                Add all to cart
              </Button>
              <Button size="sm" variant="ghost" className="!text-red-700" onClick={async () => { await api(`/business/lists/${l.id}`, { method: 'DELETE' }); void reload(); }}>
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>
      <Modal open={saving} onClose={() => setSaving(false)} title="Save cart as list">
        <div className="space-y-3">
          <Input label="List name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekly vegetables" />
          <Select label="Repeat" value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
            <option value="NONE">Don’t repeat</option>
            <option value="DAILY">Daily reminder</option>
            <option value="WEEKLY">Weekly reminder</option>
            <option value="MONTHLY">Monthly reminder</option>
          </Select>
          <Notice>Recurring lists are templates: you still review and confirm each order.</Notice>
          <Button
            block
            onClick={async () => {
              if (!businessCart) return;
              try {
                await api('/business/lists', { body: { name: name || 'My list', storeId: businessCart.store.id, recurrence, items: businessCart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })) } });
                setSaving(false);
                setName('');
                void reload();
                toast.show('List saved');
              } catch (e) {
                toast.show((e as Error).message, 'error');
              }
            }}
          >
            Save list
          </Button>
        </div>
      </Modal>
    </BusinessShell>
  );
}
