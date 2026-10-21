'use client';

import Link from 'next/link';
import { Suspense, use, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Phone } from 'lucide-react';
import { AppShell, RequireAuth } from '@/components/shells';
import { useToast } from '@/components/providers/toast';
import { useCart } from '@/components/providers/cart';
import { api, newIdempotencyKey, useApi } from '@/lib/api';
import { money, OrderTimeline, PriceLine } from '@/components/commerce';
import { Badge, Button, Card, DemoBadge, ErrorState, Modal, Notice, Select, Spinner, StatusBadge, Textarea } from '@/components/ui';
import type { OrderDetail } from '@/lib/types';

const PAYMENT_LABEL: Record<string, string> = {
  PENDING: 'Payment pending',
  PAID: 'Paid',
  FAILED: 'Payment failed',
  COD_PENDING: 'Pay on delivery',
  COD_COLLECTED: 'Paid in cash',
  CREDIT_DUE: 'On business credit',
  REFUND_PENDING: 'Refund in progress',
  REFUNDED: 'Refunded',
  VOID: 'No payment taken',
};

function OrderInner({ id }: { id: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { refresh: refreshCart } = useCart();
  const { data, error, loading, reload } = useApi<{ order: OrderDetail }>(`/orders/${id}`);
  const [modal, setModal] = useState<'cancel' | 'review' | 'return' | null>(null);
  const [busy, setBusy] = useState(false);

  // Poll while the order is in progress so status updates appear without a manual refresh.
  const active = data && !['DELIVERED', 'CANCELLED', 'REJECTED'].includes(data.order.status);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => void reload(), 15_000);
    return () => clearInterval(t);
  }, [active, reload]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;
  const o = data.order;
  const addr = o.deliveryAddress;

  const retryPayment = async () => {
    setBusy(true);
    try {
      const method = o.paymentMethod === 'COD' ? 'UPI' : o.paymentMethod;
      const r = await api<{ client: { checkoutPath?: string } }>(`/orders/${o.id}/pay`, { body: { method }, headers: { 'Idempotency-Key': newIdempotencyKey() } });
      if (r.client.checkoutPath) router.push(r.client.checkoutPath);
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const reorder = async () => {
    setBusy(true);
    try {
      const r = await api<{ added: number; skipped: number; mode: string }>(`/orders/${o.id}/reorder`, { body: {} });
      await refreshCart();
      toast.show(`${r.added} item(s) added${r.skipped ? `, ${r.skipped} unavailable` : ''}`);
      router.push(r.mode === 'BUSINESS' ? '/cart?mode=BUSINESS' : '/cart');
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {params.get('placed') && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-brand-600 p-4 text-white">
          <CheckCircle2 className="h-8 w-8 shrink-0" aria-hidden />
          <div>
            <p className="text-lg font-bold">Order placed!</p>
            <p className="text-sm text-white/90">{o.status === 'AWAITING_RX_REVIEW' ? 'A pharmacist will review your prescription before the store prepares your order.' : `${o.store.name} will confirm your order shortly.`}</p>
          </div>
        </div>
      )}
      {params.get('payment') === 'failure' && o.paymentStatus === 'FAILED' && (
        <div className="mb-4">
          <Notice tone="red" title="Payment failed">
            No money was taken. You can try again or cancel the order. Unpaid orders are cancelled automatically after a short time.
          </Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm text-navy-700/80">Order {o.orderNumber}</p>
                <h1 className="text-xl font-bold">{o.store.name}</h1>
                <p className="text-xs text-navy-700/70">Placed {new Date(o.placedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <StatusBadge status={o.status} />
                <Badge tone={o.paymentStatus === 'FAILED' ? 'red' : o.paymentStatus === 'PAID' || o.paymentStatus === 'COD_COLLECTED' ? 'green' : 'gray'}>{PAYMENT_LABEL[o.paymentStatus] ?? o.paymentStatus}</Badge>
                {o.store.isDemo && <DemoBadge label="Demo order" />}
              </div>
            </div>
            {o.etaMinMins != null && active && o.fulfilmentType === 'DELIVERY' && (
              <p className="mt-3 rounded-xl bg-navy-50 p-3 text-sm">
                Estimated delivery: <strong>{o.etaMinMins}–{o.etaMaxMins} minutes</strong> after the store accepts. This is an estimate based on distance and store preparation time.
              </p>
            )}
            {o.deliveryOtp && (
              <div className="mt-3 rounded-xl bg-accent-50 p-3 ring-1 ring-accent-100">
                <p className="text-sm font-semibold">Delivery code</p>
                <p className="text-3xl font-bold tracking-[0.3em] tabular-nums">{o.deliveryOtp}</p>
                <p className="text-xs text-navy-700/80">Share this code with the delivery partner only when you receive your order.</p>
              </div>
            )}
            {o.cancelReason && <p className="mt-3 text-sm">Cancellation reason: {o.cancelReason}</p>}
            {o.rejectReason && <p className="mt-3 text-sm">Store/pharmacist note: {o.rejectReason}</p>}
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold">Order status</h2>
            <OrderTimeline status={o.status} events={o.events} fulfilmentType={o.fulfilmentType} />
            {o.delivery && (
              <div className="mt-2 rounded-xl bg-navy-50 p-3 text-sm">
                <p className="font-semibold">
                  Delivery partner: {o.delivery.partnerName} ({o.delivery.vehicleType.replace('_', ' ').toLowerCase()})
                </p>
                <p className="text-navy-700/80">Status: {o.delivery.status.replace('_', ' ').toLowerCase()}. Live map tracking is not available in this version.</p>
              </div>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold">Items ({o.items.length})</h2>
            <ul className="divide-y divide-navy-100">
              {o.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-3 py-2 text-sm">
                  <span>
                    {i.productName} <span className="text-navy-700/70">({i.variantName})</span> × {i.quantity}
                    {i.requiresPrescription && <Badge tone="orange" className="ml-2">Rx</Badge>}
                    {i.returnedQty > 0 && <Badge tone="gray" className="ml-2">{i.returnedQty} returned</Badge>}
                  </span>
                  <span className="tabular-nums">{money(i.netAmount)}</span>
                </li>
              ))}
            </ul>
          </Card>

          {(o.refunds.length > 0 || o.returns.length > 0) && (
            <Card>
              <h2 className="mb-2 font-semibold">Refunds & returns</h2>
              {o.returns.map((r) => (
                <p key={r.id} className="text-sm">
                  Return {r.status.toLowerCase()} – {money(r.amount)} – {r.reason}
                  {r.resolutionNote && ` (${r.resolutionNote})`}
                </p>
              ))}
              {o.refunds.map((r) => (
                <p key={r.id} className="text-sm">
                  Refund {r.status.toLowerCase()} – {money(r.amount)}
                </p>
              ))}
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card className="space-y-2">
            <h2 className="font-semibold">Bill details</h2>
            <PriceLine label="Items total" value={money(o.totals.itemsSubtotal)} />
            {o.totals.discount > 0 && <PriceLine label={`Discount${o.couponCode ? ` (${o.couponCode})` : ''}`} value={`− ${money(o.totals.discount)}`} tone="green" />}
            <PriceLine label="Delivery fee" value={o.totals.deliveryFee ? money(o.totals.deliveryFee) : 'Free'} />
            <PriceLine label="Total" value={money(o.totals.grandTotal)} strong />
            <p className="text-xs text-navy-700/70">Includes GST {money(o.totals.taxTotal)} · Paid via {o.paymentMethod.replace('_', ' ')}</p>
            {!['CANCELLED', 'REJECTED', 'PENDING_PAYMENT', 'AWAITING_RX_REVIEW'].includes(o.status) && (
              <Link href={`/orders/${o.id}/invoice`} className="inline-block text-sm font-semibold text-brand-700 underline">
                {o.status === 'DELIVERED' ? 'View tax invoice' : 'View order summary'}
              </Link>
            )}
          </Card>
          {addr && (
            <Card>
              <h2 className="font-semibold">Delivery address</h2>
              <p className="mt-1 text-sm">
                {String(addr.contactName)}, {String(addr.line1)}, {String(addr.locality)}, {String(addr.city)} {String(addr.postalCode)}
              </p>
            </Card>
          )}
          <Card className="space-y-2">
            {o.actions.canPay && (
              <Button block onClick={retryPayment} loading={busy}>
                {o.paymentStatus === 'FAILED' ? 'Retry payment' : 'Complete payment'}
              </Button>
            )}
            {o.actions.canReview && (
              <Button block variant="secondary" onClick={() => setModal('review')}>
                Rate this order
              </Button>
            )}
            {o.review && <p className="text-sm">Your rating: {'★'.repeat(o.review.rating)}</p>}
            {o.actions.canReturn && (
              <Button block variant="secondary" onClick={() => setModal('return')}>
                Request return / refund
              </Button>
            )}
            {['DELIVERED', 'CANCELLED', 'REJECTED'].includes(o.status) && o.vertical !== 'CHEMIST' && (
              <Button block variant="secondary" onClick={reorder} loading={busy}>
                Order again
              </Button>
            )}
            <a href={`tel:${o.store.phone}`} className="flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold ring-1 ring-navy-100 hover:bg-navy-50">
              <Phone className="h-4 w-4" aria-hidden /> Call store
            </a>
            <Link href={`/support?orderId=${o.id}`} className="flex h-11 items-center justify-center rounded-xl text-sm font-semibold ring-1 ring-navy-100 hover:bg-navy-50">
              Get help with this order
            </Link>
            {o.actions.canCancel && (
              <Button block variant="ghost" className="!text-red-700" onClick={() => setModal('cancel')}>
                Cancel order
              </Button>
            )}
          </Card>
        </aside>
      </div>

      <CancelModal open={modal === 'cancel'} onClose={() => setModal(null)} orderId={o.id} onDone={() => { setModal(null); void reload(); }} />
      <ReviewModal open={modal === 'review'} onClose={() => setModal(null)} orderId={o.id} onDone={() => { setModal(null); void reload(); }} />
      <ReturnModal open={modal === 'return'} onClose={() => setModal(null)} order={o} onDone={() => { setModal(null); void reload(); }} />
    </>
  );
}

function CancelModal({ open, onClose, orderId, onDone }: { open: boolean; onClose: () => void; orderId: string; onDone: () => void }) {
  const [reason, setReason] = useState('Ordered by mistake');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal open={open} onClose={onClose} title="Cancel order">
      <div className="space-y-3">
        <Select label="Reason" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option>Ordered by mistake</option>
          <option>Delivery is taking too long</option>
          <option>Found a better price</option>
          <option>Want to change items or address</option>
          <option>Other</option>
        </Select>
        <p className="text-sm text-navy-700/80">Any online payment will be refunded to the original method.</p>
        {err && <Notice tone="red">{err}</Notice>}
        <Button
          variant="danger"
          block
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              await api(`/orders/${orderId}/cancel`, { body: { reason } });
              onDone();
            } catch (e) {
              setErr((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Cancel order
        </Button>
      </div>
    </Modal>
  );
}

function ReviewModal({ open, onClose, orderId, onDone }: { open: boolean; onClose: () => void; orderId: string; onDone: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title="Rate your order">
      <div className="space-y-3">
        <div role="radiogroup" aria-label="Rating" className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => setRating(n)} className={`text-4xl ${n <= rating ? 'text-accent-500' : 'text-navy-100'}`}>
              ★
            </button>
          ))}
        </div>
        <Textarea label="Comments (optional)" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
        <Button
          block
          loading={busy}
          onClick={async () => {
            setBusy(true);
            await api(`/orders/${orderId}/review`, { body: { rating, comment: comment || null } }).finally(() => setBusy(false));
            onDone();
          }}
        >
          Submit rating
        </Button>
      </div>
    </Modal>
  );
}

function ReturnModal({ open, onClose, order, onDone }: { open: boolean; onClose: () => void; order: OrderDetail; onDone: () => void }) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal open={open} onClose={onClose} title="Request a return">
      <div className="space-y-3">
        <p className="text-sm text-navy-700/80">Choose the items and quantities to return. Returns are reviewed by our support team.</p>
        {order.items.map((i) => {
          const max = i.quantity - i.returnedQty;
          return (
            <div key={i.id} className="flex items-center justify-between gap-3 text-sm">
              <span>
                {i.productName} ({i.variantName})
              </span>
              <select className="rounded-lg border-0 ring-1 ring-navy-100" value={qty[i.id] ?? 0} onChange={(e) => setQty({ ...qty, [i.id]: Number(e.target.value) })} aria-label={`Quantity of ${i.productName} to return`}>
                {Array.from({ length: max + 1 }, (_, n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
        <Textarea label="What went wrong?" value={reason} onChange={(e) => setReason(e.target.value)} required />
        {err && <Notice tone="red">{err}</Notice>}
        <Button
          block
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              const items = Object.entries(qty)
                .filter(([, q]) => q > 0)
                .map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
              await api(`/orders/${order.id}/returns`, { body: { reason, items } });
              onDone();
            } catch (e) {
              setErr((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Submit return request
        </Button>
      </div>
    </Modal>
  );
}

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AppShell>
      <Link href="/orders" className="mb-3 inline-block text-sm font-medium text-brand-700 hover:underline">
        ← All orders
      </Link>
      <RequireAuth>
        <Suspense>
          <OrderInner id={id} />
        </Suspense>
      </RequireAuth>
    </AppShell>
  );
}
