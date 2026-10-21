'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { Heart } from 'lucide-react';
import { AppShell } from '@/components/shells';
import { useLocation } from '@/components/providers/location';
import { useAuth } from '@/components/providers/auth';
import { useCart } from '@/components/providers/cart';
import { useToast } from '@/components/providers/toast';
import { api, useApi } from '@/lib/api';
import { AddToCart, money, ProductArt } from '@/components/commerce';
import { Badge, Button, Card, DemoBadge, EmptyState, ErrorState, LinkButton, Notice, Spinner } from '@/components/ui';
import type { ProductCard } from '@/lib/types';

interface ProductResp {
  product: Omit<ProductCard, 'variants' | 'category'> & { category: { name: string; slug: string; icon: string | null } };
  availability: ProductCard | null;
  rating: { average: number | null; count: number };
  favourite: boolean;
}

export default function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { query, location } = useLocation();
  const { user } = useAuth();
  const { setItem, quantityOf } = useCart();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<ProductResp>(`/catalog/products/${slug}${query ? `?${query}` : ''}`);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [fav, setFav] = useState<boolean | null>(null);

  if (loading) return <AppShell><Spinner /></AppShell>;
  if (error) return <AppShell><ErrorState error={error} onRetry={reload} /></AppShell>;
  if (!data) return null;
  const p = data.product;
  const avail = data.availability;
  const variant = avail?.variants.find((v) => v.id === variantId) ?? avail?.variants[0];
  const isFav = fav ?? data.favourite;

  return (
    <AppShell>
      <nav className="mb-3 text-sm text-navy-700/80" aria-label="Breadcrumb">
        <Link href="/categories" className="hover:underline">
          Categories
        </Link>{' '}
        /{' '}
        <Link href={`/category/${p.category.slug}`} className="hover:underline">
          {p.category.name}
        </Link>
      </nav>
      <div className="grid gap-6 md:grid-cols-2">
        <ProductArt icon={p.category.icon} vertical={p.vertical} className="aspect-square w-full max-w-md" demo={p.isDemo} />
        <div>
          <div className="flex flex-wrap gap-2">
            {p.isDemo && <DemoBadge label="Demo product" />}
            {p.requiresPrescription && <Badge tone="orange">Prescription required</Badge>}
            {p.isRegional && <Badge tone="navy">Local favourite</Badge>}
          </div>
          <h1 className="mt-2 text-2xl font-bold">{p.name}</h1>
          {p.brand && <p className="text-sm text-navy-700/80">by {p.brand.name}</p>}
          {data.rating.count > 0 && <p className="mt-1 text-sm">★ {data.rating.average?.toFixed(1)} ({data.rating.count} ratings)</p>}

          {p.vertical === 'CHEMIST' && (
            <dl className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-navy-50 p-3 text-sm">
              {p.genericName && (<><dt className="text-navy-700/70">Composition</dt><dd className="font-medium">{p.genericName}</dd></>)}
              {p.strength && (<><dt className="text-navy-700/70">Strength</dt><dd className="font-medium">{p.strength}</dd></>)}
              {p.dosageForm && (<><dt className="text-navy-700/70">Form</dt><dd className="font-medium">{p.dosageForm}</dd></>)}
              {p.manufacturer && (<><dt className="text-navy-700/70">Manufacturer</dt><dd className="font-medium">{p.manufacturer}</dd></>)}
              <dt className="text-navy-700/70">Schedule</dt>
              <dd className="font-medium">{p.schedule === 'OTC' ? 'Over the counter' : p.schedule?.replace('_', ' ')}</dd>
            </dl>
          )}
          {p.requiresPrescription && (
            <div className="mt-3">
              <Notice tone="orange" title="Prescription medicine">
                You will need to upload a valid prescription at checkout. A registered pharmacist reviews it before your order is confirmed. Do not self-medicate.
              </Notice>
            </div>
          )}

          {!location ? (
            <div className="mt-5">
              <EmptyState icon="📍" title="Choose your location to see price and availability" action={<LinkButton href="/location">Select location</LinkButton>} />
            </div>
          ) : !avail || !variant ? (
            <div className="mt-5">
              <Notice tone="red" title="Not available near you">No store that delivers to {location.localityName} has this product in stock right now.</Notice>
            </div>
          ) : (
            <>
              {avail.variants.length > 1 && (
                <fieldset className="mt-5">
                  <legend className="mb-2 text-sm font-semibold">Pack size</legend>
                  <div className="flex flex-wrap gap-2">
                    {avail.variants.map((v) => (
                      <button key={v.id} onClick={() => setVariantId(v.id)} aria-pressed={variant.id === v.id} className={`rounded-xl px-3 py-2 text-sm font-semibold ring-1 ${variant.id === v.id ? 'bg-brand-50 ring-2 ring-brand-600' : 'bg-white ring-navy-100'}`}>
                        {v.name} · {money(v.bestOffer?.price)}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
              <Card className="mt-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-2xl font-bold">
                      {money(variant.bestOffer!.price)}
                      {!variant.bestOffer!.taxInclusive && <span className="ml-1 text-sm font-medium text-navy-700/70">+ GST</span>}
                    </p>
                    {variant.mrp > variant.bestOffer!.price && <p className="text-sm text-navy-700/70">MRP <span className="line-through">{money(variant.mrp)}</span> (incl. of all taxes)</p>}
                    <p className="mt-1 text-sm">
                      {variant.bestOffer!.inStock ? (
                        <span className="font-semibold text-brand-700">{variant.bestOffer!.lowStock ? `Only ${variant.bestOffer!.stockLeft} left` : 'In stock'}</span>
                      ) : (
                        <span className="font-semibold text-red-700">Out of stock</span>
                      )}
                      <span className="text-navy-700/80"> · Est. {variant.bestOffer!.etaMinMins}–{variant.bestOffer!.etaMaxMins} min</span>
                    </p>
                  </div>
                  <AddToCart variant={variant} label={`${p.name} ${variant.name}`} />
                </div>
              </Card>
              <h2 className="mt-5 font-semibold">Sold by {variant.offers.length} store{variant.offers.length > 1 ? 's' : ''} near you</h2>
              <ul className="mt-2 divide-y divide-navy-100 rounded-2xl bg-white ring-1 ring-navy-100">
                {variant.offers.map((o) => (
                  <li key={o.storeId} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <Link href={`/store/${o.storeSlug}`} className="font-semibold hover:underline">
                        {o.storeName}
                      </Link>
                      <p className="text-xs text-navy-700/80">
                        {o.distanceKm} km · est. {o.etaMinMins}–{o.etaMaxMins} min · {o.inStock ? 'in stock' : 'out of stock'}
                        {!o.isOpen && ' · closed'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold">{money(o.price)}</span>
                      {o.inStock && o.isOpen && quantityOf(variant.id) === 0 && (
                        <Button size="sm" variant="secondary" onClick={() => setItem({ storeId: o.storeId, variantId: variant.id, quantity: o.minOrderQty })} aria-label={`Add from ${o.storeName}`}>
                          Add
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          {p.description && (
            <section className="mt-5">
              <h2 className="font-semibold">About this product</h2>
              <p className="mt-1 text-sm text-navy-700/90">{p.description}</p>
              <p className="mt-2 text-xs text-navy-700/70">GST {p.taxRateBps / 100}% included in retail prices.</p>
            </section>
          )}
          {user && (
            <Button
              className="mt-4"
              variant="ghost"
              aria-pressed={isFav}
              onClick={async () => {
                await api('/me/favourites', { body: { type: 'product', id: p.id, favourite: !isFav } });
                setFav(!isFav);
                toast.show(!isFav ? 'Saved to favourites' : 'Removed from favourites');
              }}
            >
              <Heart className={`h-4 w-4 ${isFav ? 'fill-red-600 text-red-600' : ''}`} aria-hidden /> {isFav ? 'Saved to favourites' : 'Save to favourites'}
            </Button>
          )}
        </div>
      </div>
    </AppShell>
  );
}
