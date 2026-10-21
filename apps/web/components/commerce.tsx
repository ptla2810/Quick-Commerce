'use client';

import Link from 'next/link';
import { Clock, Minus, Plus, Star, Store as StoreIcon } from 'lucide-react';
import { formatINR, formatMinuteOfDay, ORDER_PROGRESS_STEPS, ORDER_STATUS_LABELS, type OrderStatus } from '@padosi/shared';
import type { ProductCard as Product, StoreSummary, VariantCard } from '@/lib/types';
import { useCart } from './providers/cart';
import { Badge, Button, cx, DemoBadge } from './ui';
import { useState } from 'react';

export const money = (paise: number | null | undefined) => (paise == null ? '—' : formatINR(paise));

const VERTICAL_BG: Record<string, string> = {
  GROCERY: 'from-brand-50 to-brand-100',
  HORECA: 'from-navy-50 to-navy-100',
  CHEMIST: 'from-sky-50 to-sky-100',
};

/** Product imagery placeholder: no real photos ship with the demo, so we show a labelled illustration. */
export function ProductArt({ icon, vertical, className, demo }: { icon?: string | null; vertical: string; className?: string; demo?: boolean }) {
  return (
    <div className={cx('relative flex items-center justify-center rounded-xl bg-gradient-to-br', VERTICAL_BG[vertical] ?? VERTICAL_BG.GROCERY, className)} role="img" aria-label="Illustrative product image">
      <span className="text-4xl" aria-hidden>
        {icon ?? '🛒'}
      </span>
      {demo && <span className="absolute bottom-1 right-1 rounded bg-white/80 px-1 text-[10px] font-semibold uppercase text-navy-700">demo image</span>}
    </div>
  );
}

export function QuantityStepper({ qty, onChange, min = 1, max, busy, label }: { qty: number; onChange: (q: number) => void; min?: number; max?: number; busy?: boolean; label: string }) {
  return (
    <div className="flex h-10 items-center overflow-hidden rounded-xl bg-brand-600 text-white" aria-busy={busy}>
      <button className="flex h-10 w-10 items-center justify-center hover:bg-brand-700 disabled:opacity-50" onClick={() => onChange(qty <= min ? 0 : qty - 1)} disabled={busy} aria-label={`Decrease ${label}`}>
        <Minus className="h-4 w-4" />
      </button>
      <span className="min-w-8 text-center text-sm font-bold tabular-nums" aria-live="polite">
        {qty}
      </span>
      <button className="flex h-10 w-10 items-center justify-center hover:bg-brand-700 disabled:opacity-50" onClick={() => onChange(qty + 1)} disabled={busy || (max != null && qty >= max)} aria-label={`Increase ${label}`}>
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

export function AddToCart({ variant, mode = 'RETAIL', label }: { variant: VariantCard; mode?: 'RETAIL' | 'BUSINESS'; label: string }) {
  const { setItem, quantityOf, pending } = useCart();
  const offer = variant.bestOffer;
  if (!offer) return null;
  const qty = quantityOf(variant.id, mode);
  const busy = pending === variant.id;
  if (!offer.inStock) return <span className="text-xs font-semibold text-red-700">Out of stock</span>;
  if (!offer.isOpen) return <span className="text-xs font-semibold text-navy-700/70">Store closed</span>;
  if (qty === 0)
    return (
      <Button size="sm" variant="secondary" className="!text-brand-700 ring-brand-500" loading={busy} onClick={() => setItem({ storeId: offer.storeId, variantId: variant.id, quantity: offer.minOrderQty, mode })} aria-label={`Add ${label} to cart`}>
        Add
      </Button>
    );
  return <QuantityStepper qty={qty} min={offer.minOrderQty} busy={busy} label={label} onChange={(q) => setItem({ storeId: offer.storeId, variantId: variant.id, quantity: q, mode })} />;
}

export function ProductCardView({ product, mode = 'RETAIL', locked }: { product: Product; mode?: 'RETAIL' | 'BUSINESS'; locked?: boolean }) {
  const [variantId, setVariantId] = useState(product.variants[0]?.id);
  const variant = product.variants.find((v) => v.id === variantId) ?? product.variants[0];
  const offer = variant?.bestOffer;
  if (!variant || !offer) return null;
  const discount = variant.mrp > offer.price && offer.taxInclusive ? Math.round(((variant.mrp - offer.price) / variant.mrp) * 100) : 0;
  return (
    <article className="flex flex-col rounded-2xl bg-white p-3 ring-1 ring-navy-100/70">
      <Link href={`/product/${product.slug}`} className="block">
        <ProductArt icon={product.category.icon} vertical={product.vertical} className="aspect-square w-full" demo={product.isDemo} />
      </Link>
      <div className="mt-2 flex flex-wrap gap-1">
        {discount > 0 && <Badge tone="green">{discount}% off</Badge>}
        {product.requiresPrescription && <Badge tone="orange">Rx required</Badge>}
        {product.isRegional && <Badge tone="navy">Local</Badge>}
        {offer.lowStock && <Badge tone="red">Only {offer.stockLeft} left</Badge>}
      </div>
      <Link href={`/product/${product.slug}`} className="mt-1 line-clamp-2 min-h-10 text-sm font-semibold text-navy-900 hover:underline">
        {product.name}
      </Link>
      {product.variants.length > 1 ? (
        <select className="mt-1 rounded-lg border-0 bg-navy-50 py-1 pl-2 pr-7 text-xs text-navy-800 ring-0" value={variant.id} onChange={(e) => setVariantId(e.target.value)} aria-label={`Pack size for ${product.name}`}>
          {product.variants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      ) : (
        <p className="mt-1 text-xs text-navy-700/70">{variant.name}</p>
      )}
      <p className="mt-1 flex items-center gap-1 text-[11px] text-navy-700/70">
        <Clock className="h-3 w-3" aria-hidden /> {offer.etaMinMins}–{offer.etaMaxMins} min · {offer.storeName}
      </p>
      <div className="mt-auto flex items-end justify-between gap-2 pt-2">
        <div>
          <p className="text-base font-bold text-navy-900">
            {money(offer.price)}
            {!offer.taxInclusive && <span className="ml-1 text-[10px] font-medium text-navy-700/70">+GST</span>}
          </p>
          {discount > 0 && <p className="text-xs text-navy-700/60 line-through">{money(variant.mrp)}</p>}
          {offer.minOrderQty > 1 && <p className="text-[11px] text-navy-700/70">Min. {offer.minOrderQty}</p>}
        </div>
        {locked ? <span className="text-xs text-navy-700/70">Verify to order</span> : <AddToCart variant={variant} mode={mode} label={`${product.name} ${variant.name}`} />}
      </div>
    </article>
  );
}

export function ProductGrid({ products, mode, locked }: { products: Product[]; mode?: 'RETAIL' | 'BUSINESS'; locked?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {products.map((p) => (
        <ProductCardView key={p.id} product={p} mode={mode} locked={locked} />
      ))}
    </div>
  );
}

export function ProductRail({ products }: { products: Product[] }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
      {products.map((p) => (
        <div key={p.id} className="w-40 shrink-0 sm:w-44">
          <ProductCardView product={p} />
        </div>
      ))}
    </div>
  );
}

export function StoreCard({ store }: { store: StoreSummary }) {
  return (
    <Link href={`/store/${store.slug}`} className="flex min-w-0 gap-3 rounded-2xl bg-white p-3 ring-1 ring-navy-100/70 hover:ring-brand-500">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-800">
        <StoreIcon className="h-6 w-6" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <p className="min-w-0 truncate font-semibold text-navy-900">{store.name}</p>
          {store.isDemo && <DemoBadge />}
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-navy-700/80">
          {store.ratingCount > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <Star className="h-3 w-3 fill-accent-500 text-accent-500" aria-hidden /> {store.ratingAvg.toFixed(1)}
            </span>
          )}
          {store.distanceKm != null && <span>{store.distanceKm} km</span>}
          {store.etaMinMins != null && (
            <span>
              {store.etaMinMins}–{store.etaMaxMins} min (est.)
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs">
          {store.isOpen ? (
            <span className="font-medium text-brand-700">Open{store.openMinute === store.closeMinute ? ' 24 hours' : ` · closes ${formatMinuteOfDay(store.closeMinute)}`}</span>
          ) : (
            <span className="font-medium text-red-700">{store.isTemporarilyClosed ? 'Temporarily closed' : `Closed · opens ${formatMinuteOfDay(store.openMinute)}`}</span>
          )}
          <span className="text-navy-700/70"> · Min. order {money(store.minOrderValue)}</span>
        </p>
      </div>
    </Link>
  );
}

export function OrderTimeline({ status, events, fulfilmentType }: { status: string; events: { toStatus: string; at: string }[]; fulfilmentType: string }) {
  if (['CANCELLED', 'REJECTED', 'AWAITING_RX_REVIEW', 'PENDING_PAYMENT', 'DELIVERY_FAILED'].includes(status)) {
    return (
      <ol className="space-y-2">
        {events.map((e, i) => (
          <li key={i} className="flex items-center gap-3 text-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-navy-700" aria-hidden />
            <span className="font-medium">{ORDER_STATUS_LABELS[e.toStatus as OrderStatus] ?? e.toStatus}</span>
            <span className="text-navy-700/60">{new Date(e.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
          </li>
        ))}
      </ol>
    );
  }
  const steps = ORDER_PROGRESS_STEPS.filter((s) => !(fulfilmentType === 'PICKUP' && s === 'OUT_FOR_DELIVERY'));
  const current = steps.indexOf(status as OrderStatus);
  return (
    <ol className="space-y-0">
      {steps.map((s, i) => {
        const done = i <= current;
        const at = events.find((e) => e.toStatus === s)?.at;
        return (
          <li key={s} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={cx('mt-1 flex h-4 w-4 items-center justify-center rounded-full ring-2', done ? 'bg-brand-600 ring-brand-600' : 'bg-white ring-navy-100')} aria-hidden />
              {i < steps.length - 1 && <span className={cx('w-0.5 flex-1', i < current ? 'bg-brand-600' : 'bg-navy-100')} style={{ minHeight: 28 }} aria-hidden />}
            </div>
            <div className="pb-4">
              <p className={cx('text-sm font-semibold', done ? 'text-navy-900' : 'text-navy-700/50')}>
                {s === 'READY_FOR_PICKUP' && fulfilmentType === 'PICKUP' ? 'Ready — collect from store' : ORDER_STATUS_LABELS[s]}
                {i === current && <span className="sr-only"> (current step)</span>}
              </p>
              {at && <p className="text-xs text-navy-700/60">{new Date(at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function PriceLine({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'green' }) {
  return (
    <div className={cx('flex justify-between gap-4 text-sm', strong && 'text-base font-bold', tone === 'green' && 'text-brand-700')}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
