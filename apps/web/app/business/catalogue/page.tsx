'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BusinessShell } from '@/components/business';
import { ProductListing } from '@/components/listing';
import { useAuth } from '@/components/providers/auth';
import { useLocation } from '@/components/providers/location';
import { useCart } from '@/components/providers/cart';
import { api, ApiError, useApi } from '@/lib/api';
import { StoreCard } from '@/components/commerce';
import { Button, Card, EmptyState, LinkButton, Notice, PageTitle, Select, Textarea } from '@/components/ui';
import type { StoreSummary } from '@/lib/types';

function QuickOrder({ stores }: { stores: StoreSummary[] }) {
  const [storeId, setStoreId] = useState(stores[0]?.id ?? '');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ line: number; sku?: string; ok: boolean; message?: string }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { refresh } = useCart();
  const router = useRouter();

  const submit = async (replaceCart: boolean) => {
    const items = text
      .split('\n')
      .map((l) => l.split(/[,\t]/).map((s) => s.trim()))
      .filter((p) => p[0])
      .map(([sku, qty]) => ({ sku: sku.toUpperCase(), quantity: Math.max(1, parseInt(qty || '1', 10) || 1) }));
    if (!items.length) return setErr('Enter at least one line as SKU, quantity');
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ results: typeof results }>('/cart/bulk', { body: { storeId, mode: 'BUSINESS', items, replaceCart } });
      setResults(r.results);
      await refresh();
    } catch (e) {
      if ((e as ApiError).code === 'CART_STORE_CONFLICT' && window.confirm(`${(e as Error).message}\n\nReplace your business cart?`)) return submit(true);
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h2 className="font-semibold">Quick order entry</h2>
      <p className="mb-3 text-sm text-navy-700/80">Paste one item per line as <code>SKU, quantity</code> — for example from your last purchase sheet.</p>
      <div className="grid gap-3">
        <Select label="Supplier" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Textarea label="Items" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={'B-ONION-25KG, 2\nB-SOY-15L, 1'} />
        {err && <Notice tone="red">{err}</Notice>}
        {results && (
          <ul className="space-y-1 text-sm">
            {results.map((r) => (
              <li key={r.line} className={r.ok ? 'text-brand-700' : 'text-red-700'}>
                Line {r.line} {r.sku && `(${r.sku})`}: {r.ok ? `added${r.message ? ` – ${r.message}` : ''}` : r.message}
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Button loading={busy} onClick={() => submit(false)}>
            Add to cart
          </Button>
          {results?.some((r) => r.ok) && (
            <Button variant="secondary" onClick={() => router.push('/cart?mode=BUSINESS')}>
              Go to cart
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function CatalogueInner() {
  const category = useSearchParams().get('category') ?? undefined;
  const { user } = useAuth();
  const { location, query } = useLocation();
  const verified = user?.businessProfile?.verificationStatus === 'APPROVED';
  const suppliers = useApi<{ stores: StoreSummary[] }>(location ? `/stores/nearby?${query}&vertical=HORECA` : null);
  const [storeId, setStoreId] = useState<string | undefined>(undefined);

  if (!location) return <EmptyState icon="📍" title="Choose your delivery location" action={<LinkButton href="/location">Select location</LinkButton>} />;
  return (
    <>
      <PageTitle title="Bulk catalogue" subtitle={verified ? 'Wholesale prices (GST extra) for your verified business' : 'List prices shown. Wholesale prices unlock after verification.'} />
      {!user?.businessProfile && (
        <div className="mb-4">
          <Notice tone="orange" title="Register your business to order in bulk">
            <LinkButton href="/business" size="sm" className="mt-2">Register business</LinkButton>
          </Notice>
        </div>
      )}
      <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_380px]">
        <div>
          <h2 className="mb-2 font-semibold">Suppliers delivering to {location.localityName}</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {suppliers.data?.stores.map((s) => (
              <div key={s.id} className={storeId === s.id ? 'rounded-2xl ring-2 ring-brand-600' : ''}>
                <StoreCard store={s} />
                <button className="mt-1 text-xs font-semibold text-brand-700 underline" onClick={() => setStoreId(storeId === s.id ? undefined : s.id)}>
                  {storeId === s.id ? 'Show all suppliers' : 'Show only this supplier'}
                </button>
              </div>
            ))}
          </div>
          {suppliers.data?.stores.length === 0 && <p className="text-sm">No HoReCa suppliers deliver here yet.</p>}
        </div>
        {verified && suppliers.data && suppliers.data.stores.length > 0 && <QuickOrder stores={suppliers.data.stores} />}
      </div>
      <ProductListing vertical="HORECA" mode={verified ? 'BUSINESS' : 'RETAIL'} locked={!verified} storeId={storeId} category={category} />
    </>
  );
}

export default function CataloguePage() {
  return (
    <BusinessShell>
      <Suspense>
        <CatalogueInner />
      </Suspense>
    </BusinessShell>
  );
}
