'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell, RequireAuth } from '@/components/shells';
import { useCart } from '@/components/providers/cart';
import { useLocation } from '@/components/providers/location';
import { api, ApiError, newIdempotencyKey, useApi } from '@/lib/api';
import { AddressForm, type Address } from '@/components/address';
import { money, PriceLine } from '@/components/commerce';
import { Badge, Button, Card, EmptyState, Input, LinkButton, Modal, Notice, PageTitle, Spinner, Textarea } from '@/components/ui';

interface Quote {
  canPlaceOrder: boolean;
  requiresPrescription: boolean;
  issues: { code: string; message: string }[];
  paymentMethods: { method: string; available: boolean; reason?: string }[];
  delivery: { distanceKm: number; etaMinMins: number; etaMaxMins: number } | null;
  coupon: { code: string; description: string } | null;
  lines: { variantId: string; productName: string; variantName: string; quantity: number; lineAmount: number; tax: number }[];
  totals: { itemsSubtotal: number; mrpTotal: number; savings: number; discount: number; deliveryFee: number; taxableValue: number; taxTotal: number; grandTotal: number } | null;
}

interface Prescription {
  id: string;
  patientName: string;
  status: string;
  createdAt: string;
  file: { originalName: string };
}

const METHOD_LABEL: Record<string, string> = { COD: 'Cash on delivery', UPI: 'UPI', CARD: 'Debit / credit card', NETBANKING: 'Net banking', BUSINESS_CREDIT: 'Business credit' };

function CheckoutInner() {
  const mode = useSearchParams().get('mode') === 'BUSINESS' ? 'BUSINESS' : 'RETAIL';
  const router = useRouter();
  const { cart: retail, businessCart, refresh } = useCart();
  const cart = mode === 'BUSINESS' ? businessCart : retail;
  const { location } = useLocation();
  const addresses = useApi<{ addresses: Address[] }>('/me/addresses');
  const prescriptions = useApi<{ prescriptions: Prescription[] }>(cart?.requiresPrescription ? '/me/prescriptions' : null);

  const [addressId, setAddressId] = useState<string | null>(location?.addressId ?? null);
  const [fulfilment, setFulfilment] = useState<'DELIVERY' | 'PICKUP'>('DELIVERY');
  const [payment, setPayment] = useState('COD');
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<string | null>(null);
  const [prescriptionId, setPrescriptionId] = useState<string | null>(null);
  const [scheduledFor, setScheduledFor] = useState('');
  const [notes, setNotes] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // One key per checkout attempt: a double tap or network retry cannot create a second order.
  const idemKey = useRef(newIdempotencyKey());

  useEffect(() => {
    if (!addressId && addresses.data?.addresses.length) {
      const pick = addresses.data.addresses.find((a) => a.serviceable && a.isDefault) ?? addresses.data.addresses.find((a) => a.serviceable) ?? addresses.data.addresses[0];
      setAddressId(pick.id);
    }
  }, [addresses.data, addressId]);

  const body = useCallback(
    () => ({
      mode,
      addressId: fulfilment === 'DELIVERY' ? addressId ?? undefined : undefined,
      fulfilmentType: fulfilment,
      paymentMethod: payment,
      couponCode: coupon,
      prescriptionId,
      scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null,
      notes: notes || null,
    }),
    [mode, addressId, fulfilment, payment, coupon, prescriptionId, scheduledFor, notes],
  );

  useEffect(() => {
    if (!cart) return;
    let cancelled = false;
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const q = await api<Quote>('/checkout/quote', { body: body() });
        if (!cancelled) setQuote(q);
      } catch (e) {
        if (!cancelled) setPlaceError((e as Error).message);
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [body, cart]);

  if (!cart) return <EmptyState icon="🛒" title="Your cart is empty" action={<LinkButton href="/">Start shopping</LinkButton>} />;

  const couponIssue = quote?.issues.find((i) => i.code === 'COUPON_INVALID');
  const blocking = quote?.issues.filter((i) => i.code !== 'COUPON_INVALID') ?? [];

  const place = async () => {
    setPlacing(true);
    setPlaceError(null);
    try {
      const r = await api<{ order: { id: string; status: string } }>('/orders', { body: { ...body(), idempotencyKey: idemKey.current } });
      await refresh();
      if (r.order.status === 'PENDING_PAYMENT') {
        const pay = await api<{ paymentId: string; client: { checkoutPath?: string } }>(`/orders/${r.order.id}/pay`, { body: { method: payment }, headers: { 'Idempotency-Key': `${idemKey.current}-pay` } });
        router.push(pay.client.checkoutPath ?? `/orders/${r.order.id}`);
      } else router.push(`/orders/${r.order.id}?placed=1`);
    } catch (e) {
      const ae = e as ApiError;
      setPlaceError(ae.details?.issues?.map((i) => i.message).join(' · ') ?? ae.message);
      // A fresh key lets the customer retry after fixing the problem.
      idemKey.current = newIdempotencyKey();
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        {cart.store.pickupEnabled && (
          <Card>
            <h2 className="mb-3 font-semibold">How would you like to receive it?</h2>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Fulfilment">
              {(['DELIVERY', 'PICKUP'] as const).map((f) => (
                <button key={f} role="radio" aria-checked={fulfilment === f} onClick={() => setFulfilment(f)} className={`rounded-xl p-3 text-left ring-1 ${fulfilment === f ? 'bg-brand-50 ring-2 ring-brand-600' : 'ring-navy-100'}`}>
                  <span className="block font-semibold">{f === 'DELIVERY' ? 'Home delivery' : 'Pick up from store'}</span>
                  <span className="block text-xs text-navy-700/80">{f === 'DELIVERY' ? 'Delivered by a local partner' : `Collect at ${cart.store.name}`}</span>
                </button>
              ))}
            </div>
          </Card>
        )}

        {fulfilment === 'DELIVERY' && (
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Delivery address</h2>
              <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
                Add new
              </Button>
            </div>
            {addresses.loading && <Spinner />}
            {addresses.data?.addresses.length === 0 && <p className="text-sm text-navy-700/80">Add an address to continue.</p>}
            <div className="grid gap-2" role="radiogroup" aria-label="Delivery address">
              {addresses.data?.addresses.map((a) => (
                <button key={a.id} role="radio" aria-checked={addressId === a.id} onClick={() => setAddressId(a.id)} className={`rounded-xl p-3 text-left ring-1 ${addressId === a.id ? 'bg-brand-50 ring-2 ring-brand-600' : 'ring-navy-100'}`}>
                  <span className="flex items-center gap-2 font-semibold">
                    {a.label} {!a.serviceable && <Badge tone="red">Not serviceable</Badge>}
                  </span>
                  <span className="block text-sm text-navy-700/80">
                    {a.contactName}, {a.line1}, {a.locality.name}, {a.locality.city} {a.postalCode}
                  </span>
                </button>
              ))}
            </div>
            {quote?.delivery && (
              <p className="mt-3 text-sm text-navy-700/80">
                {quote.delivery.distanceKm} km away · estimated {quote.delivery.etaMinMins}–{quote.delivery.etaMaxMins} min after the store accepts (estimate, not a guarantee)
              </p>
            )}
            {cart.store.scheduledDeliveryEnabled && (
              <div className="mt-3 max-w-xs">
                <Input label="Schedule delivery (optional)" type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} hint="Leave empty for delivery as soon as possible" />
              </div>
            )}
          </Card>
        )}

        {cart.requiresPrescription && (
          <Card>
            <h2 className="font-semibold">Prescription</h2>
            <p className="mb-3 text-sm text-navy-700/80">Your cart has prescription medicines. Choose or upload a valid prescription. A registered pharmacist will review it before the order is confirmed.</p>
            {prescriptions.loading && <Spinner />}
            <div className="grid gap-2" role="radiogroup" aria-label="Prescription">
              {prescriptions.data?.prescriptions
                .filter((p) => p.status !== 'REJECTED' && p.status !== 'EXPIRED')
                .map((p) => (
                  <button key={p.id} role="radio" aria-checked={prescriptionId === p.id} onClick={() => setPrescriptionId(p.id)} className={`rounded-xl p-3 text-left ring-1 ${prescriptionId === p.id ? 'bg-brand-50 ring-2 ring-brand-600' : 'ring-navy-100'}`}>
                    <span className="block font-semibold">
                      {p.patientName} · {p.file.originalName}
                    </span>
                    <span className="block text-xs text-navy-700/80">
                      Uploaded {new Date(p.createdAt).toLocaleDateString('en-IN')} · {p.status.replace('_', ' ').toLowerCase()}
                    </span>
                  </button>
                ))}
            </div>
            <Link href="/chemist/prescriptions?return=/checkout" className="mt-3 inline-block text-sm font-semibold text-brand-700 underline">
              Upload a new prescription
            </Link>
          </Card>
        )}

        <Card>
          <h2 className="mb-3 font-semibold">Payment method</h2>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Payment method">
            {(quote?.paymentMethods ?? [{ method: 'COD', available: true }]).map((p) => (
              <button key={p.method} role="radio" aria-checked={payment === p.method} disabled={!p.available} onClick={() => setPayment(p.method)} className={`rounded-xl p-3 text-left ring-1 disabled:opacity-50 ${payment === p.method ? 'bg-brand-50 ring-2 ring-brand-600' : 'ring-navy-100'}`}>
                <span className="block font-semibold">{METHOD_LABEL[p.method] ?? p.method}</span>
                {p.reason && <span className="block text-xs text-navy-700/80">{p.reason}</span>}
              </button>
            ))}
          </div>
          {payment !== 'COD' && payment !== 'BUSINESS_CREDIT' && <p className="mt-2 text-xs text-navy-700/70">You will be taken to the payment page after placing the order. In this demo, the payment gateway is simulated.</p>}
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">Coupon</h2>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setCoupon(couponInput.trim().toUpperCase() || null);
            }}
          >
            <div className="flex-1">
              <Input label="Coupon code" value={couponInput} onChange={(e) => setCouponInput(e.target.value)} error={couponIssue?.message} placeholder="e.g. FRESH10" />
            </div>
            <Button type="submit" variant="secondary">
              Apply
            </Button>
          </form>
          {quote?.coupon && (
            <p className="mt-2 text-sm font-semibold text-brand-700">
              {quote.coupon.code} applied: {quote.coupon.description}{' '}
              <button className="ml-2 text-red-700 underline" onClick={() => { setCoupon(null); setCouponInput(''); }}>
                Remove
              </button>
            </p>
          )}
          <Link href="/offers" className="mt-2 inline-block text-sm text-brand-700 underline">
            See available offers
          </Link>
        </Card>

        <Card>
          <Textarea label="Note for the store (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} placeholder="e.g. Please ring the bell twice" />
        </Card>
      </div>

      <aside>
        <Card className="sticky top-28 space-y-2">
          <h2 className="font-semibold">Order summary</h2>
          <p className="text-sm text-navy-700/80">From {cart.store.name}</p>
          {quote?.lines.map((l) => (
            <div key={l.variantId} className="flex justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">
                {l.productName} ({l.variantName}) × {l.quantity}
              </span>
              <span className="tabular-nums">{money(l.lineAmount)}</span>
            </div>
          ))}
          <hr className="border-navy-100" />
          {quote?.totals ? (
            <>
              <PriceLine label="Items total" value={money(quote.totals.itemsSubtotal)} />
              {quote.totals.discount > 0 && <PriceLine label="Coupon discount" value={`− ${money(quote.totals.discount)}`} tone="green" />}
              <PriceLine label="Delivery fee" value={quote.totals.deliveryFee === 0 ? 'Free' : money(quote.totals.deliveryFee)} />
              <PriceLine label="Total payable" value={money(quote.totals.grandTotal)} strong />
              <p className="text-xs text-navy-700/70">Includes GST of {money(quote.totals.taxTotal)} (taxable value {money(quote.totals.taxableValue)}).</p>
              {quote.totals.savings > 0 && <p className="text-sm font-semibold text-brand-700">You save {money(quote.totals.savings)} on MRP</p>}
            </>
          ) : (
            <Spinner label="Calculating" />
          )}
          {blocking.length > 0 && (
            <Notice tone="red" title="Before you can place this order">
              <ul className="list-disc pl-4">
                {blocking.map((i, k) => (
                  <li key={k}>{i.message}</li>
                ))}
              </ul>
            </Notice>
          )}
          {placeError && <Notice tone="red">{placeError}</Notice>}
          <Button block size="lg" onClick={place} loading={placing} disabled={!quote?.canPlaceOrder || quoting}>
            {payment === 'COD' || payment === 'BUSINESS_CREDIT' ? 'Place order' : 'Place order & pay'}
            {quote?.totals ? ` · ${money(quote.totals.grandTotal)}` : ''}
          </Button>
          {quote?.requiresPrescription && <p className="text-xs text-navy-700/70">Your order will wait for pharmacist approval before the store prepares it.</p>}
        </Card>
      </aside>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add delivery address">
        {adding && (
          <AddressForm
            onSaved={async (a) => {
              setAdding(false);
              await addresses.reload();
              setAddressId(a.id);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <AppShell hideSearch>
      <PageTitle title="Checkout" back="/cart" />
      <RequireAuth>
        <Suspense>
          <CheckoutInner />
        </Suspense>
      </RequireAuth>
    </AppShell>
  );
}
