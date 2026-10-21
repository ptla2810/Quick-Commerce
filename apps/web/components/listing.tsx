'use client';

import { useMemo, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useApi } from '@/lib/api';
import type { ProductCard } from '@/lib/types';
import { useLocation } from './providers/location';
import { ProductGrid } from './commerce';
import { Button, Checkbox, EmptyState, ErrorState, Input, LinkButton, Select, Skeleton } from './ui';

export interface ListingParams {
  q?: string;
  category?: string;
  vertical?: string;
  storeId?: string;
  regional?: boolean;
  mode?: 'RETAIL' | 'BUSINESS';
  bulk?: boolean;
  locked?: boolean;
}

/** Product listing with filters. Always scoped to stores that serve the selected location. */
export function ProductListing(p: ListingParams) {
  const { location, query, ready } = useLocation();
  const [sort, setSort] = useState('relevance');
  const [brand, setBrand] = useState('');
  const [inStock, setInStock] = useState(false);
  const [minPrice, setMin] = useState('');
  const [maxPrice, setMax] = useState('');
  const [maxEta, setMaxEta] = useState('');
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const brands = useApi<{ brands: { id: string; name: string; slug: string }[] }>('/catalog/brands');

  const qs = useMemo(() => {
    const s = new URLSearchParams(query);
    if (p.q) s.set('q', p.q);
    if (p.category) s.set('category', p.category);
    if (p.vertical) s.set('vertical', p.vertical);
    if (p.storeId) s.set('storeId', p.storeId);
    if (p.regional) s.set('regional', 'true');
    if (p.mode) s.set('mode', p.mode);
    if (p.bulk) s.set('bulk', 'true');
    if (sort !== 'relevance') s.set('sort', sort);
    if (brand) s.set('brand', brand);
    if (inStock) s.set('inStock', 'true');
    if (minPrice) s.set('minPrice', String(Math.round(Number(minPrice) * 100)));
    if (maxPrice) s.set('maxPrice', String(Math.round(Number(maxPrice) * 100)));
    if (maxEta) s.set('maxEta', maxEta);
    s.set('page', String(page));
    return s.toString();
  }, [query, p.q, p.category, p.vertical, p.storeId, p.regional, p.mode, p.bulk, sort, brand, inStock, minPrice, maxPrice, maxEta, page]);

  const { data, error, loading, reload } = useApi<{ items: ProductCard[]; total: number; page: number; pageSize: number; serviceable: boolean }>(location ? `/catalog/products?${qs}` : null);

  if (!ready) return <Skeleton className="h-64" />;
  if (!location) return <EmptyState icon="📍" title="Choose your location first" body="Products and prices depend on which stores deliver to you." action={<LinkButton href="/location">Select location</LinkButton>} />;

  const filters = (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
      <Select label="Sort by" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
        <option value="relevance">Relevance</option>
        <option value="price_asc">Price: low to high</option>
        <option value="price_desc">Price: high to low</option>
        <option value="rating">Store rating</option>
        <option value="eta">Fastest delivery estimate</option>
      </Select>
      <Select label="Brand" value={brand} onChange={(e) => { setBrand(e.target.value); setPage(1); }}>
        <option value="">All brands</option>
        {brands.data?.brands.map((b) => (
          <option key={b.id} value={b.slug}>
            {b.name}
          </option>
        ))}
      </Select>
      <div className="grid grid-cols-2 gap-2">
        <Input label="Min ₹" inputMode="numeric" value={minPrice} onChange={(e) => { setMin(e.target.value.replace(/\D/g, '')); setPage(1); }} />
        <Input label="Max ₹" inputMode="numeric" value={maxPrice} onChange={(e) => { setMax(e.target.value.replace(/\D/g, '')); setPage(1); }} />
      </div>
      <Select label="Delivery estimate" value={maxEta} onChange={(e) => { setMaxEta(e.target.value); setPage(1); }}>
        <option value="">Any</option>
        <option value="30">Within 30 min</option>
        <option value="45">Within 45 min</option>
        <option value="90">Within 90 min</option>
      </Select>
      <Checkbox label="In stock only" checked={inStock} onChange={(v) => { setInStock(v); setPage(1); }} />
    </div>
  );

  return (
    <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-6">
      <aside className="hidden lg:block" aria-label="Filters">
        <h2 className="mb-3 font-semibold">Filters</h2>
        {filters}
      </aside>
      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm text-navy-700/80" aria-live="polite">
            {loading ? 'Searching…' : data ? `${data.total} product${data.total === 1 ? '' : 's'} available near ${location.localityName}` : ''}
          </p>
          <Button size="sm" variant="secondary" className="lg:hidden" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden /> Filters
          </Button>
        </div>
        {showFilters && <div className="mb-4 rounded-2xl bg-white p-4 ring-1 ring-navy-100 lg:hidden">{filters}</div>}
        {error && <ErrorState error={error} onRetry={reload} />}
        {loading && !data && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-72" />
            ))}
          </div>
        )}
        {data && !data.serviceable && <EmptyState icon="🚫" title="No stores deliver here yet" body="Try another area near you." action={<LinkButton href="/location">Change location</LinkButton>} />}
        {data && data.serviceable && data.items.length === 0 && (
          <EmptyState icon="🔍" title={p.q ? `No results for “${p.q}”` : 'Nothing here yet'} body="Try a different spelling, a local name (like “aloo” or “dal”), or clear the filters." />
        )}
        {data && data.items.length > 0 && <ProductGrid products={data.items} mode={p.mode} locked={p.locked} />}
        {data && data.total > data.pageSize && (
          <div className="mt-5 flex items-center justify-center gap-3">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span className="text-sm">
              Page {page} of {Math.ceil(data.total / data.pageSize)}
            </span>
            <Button variant="secondary" size="sm" disabled={page >= Math.ceil(data.total / data.pageSize)} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
