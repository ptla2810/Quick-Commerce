'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { AppShell, RequireAuth } from '@/components/shells';
import { useCart } from '@/components/providers/cart';
import { useToast } from '@/components/providers/toast';
import { api } from '@/lib/api';
import { money, QuantityStepper, ProductArt } from '@/components/commerce';
import { Badge, Button, Card, EmptyState, LinkButton, Notice, PageTitle, Select } from '@/components/ui';

function CartInner() {
  const mode = useSearchParams().get('mode') === 'BUSINESS' ? 'BUSINESS' : 'RETAIL';
  const { cart: retail, businessCart, setItem, pending, refresh } = useCart();
  const cart = mode === 'BUSINESS' ? businessCart : retail;
  const toast = useToast();
  const [clearing, setClearing] = useState(false);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!cart || cart.items.length === 0)
    return (
      <EmptyState
        icon="🛒"
        title="Your cart is empty"
        body={mode === 'BUSINESS' ? 'Add items from the bulk catalogue or a saved list.' : 'Browse stores near you and add items to get started.'}
        action={<LinkButton href={mode === 'BUSINESS' ? '/business/catalogue' : '/'}>{mode === 'BUSINESS' ? 'Open bulk catalogue' : 'Start shopping'}</LinkButton>}
      />
    );

  const problems = cart.items.filter((i) => i.stockStatus !== 'OK');
  const belowMin = cart.estimatedSubtotal < cart.store.minOrderValue;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div>
        <Card className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase text-navy-700/70">{mode === 'BUSINESS' ? 'Business order from' : 'Delivering from'}</p>
            <Link href={`/store/${cart.store.slug}`} className="font-semibold hover:underline">
              {cart.store.name}
            </Link>
            {!cart.store.isOpen && <Badge tone="red" className="ml-2">Closed now</Badge>}
          </div>
          <Button
            variant="ghost"
            size="sm"
            loading={clearing}
            onClick={async () => {
              setClearing(true);
              await api(`/cart?mode=${mode}`, { method: 'DELETE' });
              await refresh();
              setClearing(false);
              toast.show('Cart cleared', 'info');
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden /> Clear cart
          </Button>
        </Card>
        {problems.length > 0 && (
          <div className="mb-3">
            <Notice tone="red" title="Some items need attention">
              Update or remove the highlighted items before checkout.
            </Notice>
          </div>
        )}
        <ul className="space-y-3">
          {cart.items.map((i) => (
            <li key={i.id}>
              <Card className={i.stockStatus !== 'OK' ? 'ring-2 ring-red-300' : ''}>
                <div className="flex gap-3">
                  <ProductArt vertical={i.vertical} className="h-16 w-16 shrink-0" icon={i.vertical === 'CHEMIST' ? '💊' : i.vertical === 'HORECA' ? '📦' : '🛒'} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/product/${i.productSlug}`} className="font-semibold hover:underline">
                      {i.productName}
                    </Link>
                    <p className="text-sm text-navy-700/80">
                      {i.variantName} · {money(i.unitPrice)}
                      {!i.taxInclusive && ' + GST'} each
                    </p>
                    {i.requiresPrescription && <Badge tone="orange" className="mt-1">Prescription required</Badge>}
                    {i.stockStatus === 'OUT_OF_STOCK' && <p className="text-sm font-semibold text-red-700">Out of stock</p>}
                    {i.stockStatus === 'INSUFFICIENT' && <p className="text-sm font-semibold text-red-700">Only {i.maxQuantity} available</p>}
                    {i.stockStatus === 'UNAVAILABLE' && <p className="text-sm font-semibold text-red-700">No longer available</p>}
                    {i.tiers.length > 0 && <p className="text-xs text-brand-700">Volume price: {i.tiers.map((t) => `${t.minQty}+ @ ${money(t.unitPrice)}`).join(', ')}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <QuantityStepper qty={i.quantity} min={i.minOrderQty} max={i.maxQuantity} busy={pending === i.variantId} label={i.productName} onChange={(q) => setItem({ storeId: cart.store.id, variantId: i.variantId, quantity: q, mode })} />
                      {mode === 'RETAIL' && i.vertical !== 'CHEMIST' && (
                        <SubstitutionSelect value={i.substitutionPref} onChange={(v) => api('/cart/items', { body: { storeId: cart.store.id, variantId: i.variantId, quantity: i.quantity, mode, substitutionPref: v } }).then(refresh)} />
                      )}
                    </div>
                  </div>
                  <p className="font-bold tabular-nums">{money(i.lineTotal)}</p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </div>
      <aside>
        <Card className="sticky top-28 space-y-3">
          <h2 className="font-semibold">Summary</h2>
          <div className="flex justify-between text-sm">
            <span>Items ({cart.itemCount})</span>
            <span className="tabular-nums">{money(cart.estimatedSubtotal)}</span>
          </div>
          {belowMin && <Notice tone="orange">Add {money(cart.store.minOrderValue - cart.estimatedSubtotal)} more to reach this store’s minimum order.</Notice>}
          <p className="text-xs text-navy-700/70">Delivery fee, discounts and taxes are calculated at checkout.</p>
          <LinkButton href={`/checkout${mode === 'BUSINESS' ? '?mode=BUSINESS' : ''}`} block size="lg" variant="primary">
            Proceed to checkout
          </LinkButton>
        </Card>
      </aside>
    </div>
  );
}

function SubstitutionSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="w-48">
      <Select label="If unavailable" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="SIMILAR_ITEM">Replace with similar</option>
        <option value="CALL_ME">Call me first</option>
        <option value="NO_SUBSTITUTE">Remove item</option>
      </Select>
    </div>
  );
}

export default function CartPage() {
  return (
    <AppShell>
      <PageTitle title="Your cart" />
      <RequireAuth message="Sign in to view your cart.">
        <Suspense>
          <CartInner />
        </Suspense>
      </RequireAuth>
    </AppShell>
  );
}
