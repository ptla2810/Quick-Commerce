'use client';

import { use, useState } from 'react';
import { Heart, Phone, Star } from 'lucide-react';
import { formatMinuteOfDay } from '@padosi/shared';
import { AppShell } from '@/components/shells';
import { ProductListing } from '@/components/listing';
import { useLocation } from '@/components/providers/location';
import { useAuth } from '@/components/providers/auth';
import { useToast } from '@/components/providers/toast';
import { api, useApi } from '@/lib/api';
import { money } from '@/components/commerce';
import { Badge, Button, Card, DemoBadge, ErrorState, Notice, Spinner } from '@/components/ui';
import type { StoreSummary } from '@/lib/types';

interface StoreResp {
  store: StoreSummary & { locality: string; city: string; sellerName: string; sellerType: string; licences: { type: string; number: string; isSimulated: boolean }[] };
  deliversToSelectedLocation: boolean | null;
  reviews: { id: string; rating: number; comment: string | null; author: string; createdAt: string }[];
  favourite: boolean;
}

export default function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { query } = useLocation();
  const { user } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<StoreResp>(`/stores/${slug}${query ? `?${query}` : ''}`);
  const [fav, setFav] = useState<boolean | null>(null);
  const isFav = fav ?? data?.favourite ?? false;

  return (
    <AppShell>
      {loading && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <>
          <Card className="mb-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold">{data.store.name}</h1>
                  {data.store.isDemo && <DemoBadge label="Demo store" />}
                </div>
                <p className="mt-1 text-sm text-navy-700/80">
                  {data.store.addressLine}, {data.store.locality}, {data.store.city}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  {data.store.ratingCount > 0 && (
                    <span className="inline-flex items-center gap-1 font-semibold">
                      <Star className="h-4 w-4 fill-accent-500 text-accent-500" aria-hidden /> {data.store.ratingAvg.toFixed(1)} ({data.store.ratingCount})
                    </span>
                  )}
                  {data.store.isOpen ? <Badge tone="green">Open now</Badge> : <Badge tone="red">Closed</Badge>}
                  <span className="text-navy-700/80">{data.store.openMinute === data.store.closeMinute ? 'Open 24 hours' : `${formatMinuteOfDay(data.store.openMinute)} – ${formatMinuteOfDay(data.store.closeMinute)}`}</span>
                  {data.store.etaMinMins != null && <span className="text-navy-700/80">· Est. {data.store.etaMinMins}–{data.store.etaMaxMins} min</span>}
                </div>
                <p className="mt-1 text-sm text-navy-700/80">
                  Min. order {money(data.store.minOrderValue)} · Delivery {money(data.store.baseDeliveryFee)}
                  {data.store.freeDeliveryAbove > 0 && `, free above ${money(data.store.freeDeliveryAbove)}`}
                  {data.store.pickupEnabled && ' · Store pickup available'}
                </p>
                {data.store.licences.length > 0 && (
                  <p className="mt-1 text-xs text-navy-700/70">
                    Licences: {data.store.licences.map((l) => `${l.type.replace(/_/g, ' ').toLowerCase()} ${l.number}${l.isSimulated ? ' (simulated)' : ''}`).join(' · ')}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <a href={`tel:${data.store.phone}`} className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold ring-1 ring-navy-100 hover:bg-navy-50">
                  <Phone className="h-4 w-4" aria-hidden /> Call store
                </a>
                {user && (
                  <Button
                    variant="secondary"
                    aria-pressed={isFav}
                    onClick={async () => {
                      await api('/me/favourites', { body: { type: 'store', id: data.store.id, favourite: !isFav } });
                      setFav(!isFav);
                      toast.show(!isFav ? 'Saved to favourites' : 'Removed from favourites');
                    }}
                  >
                    <Heart className={`h-4 w-4 ${isFav ? 'fill-red-600 text-red-600' : ''}`} aria-hidden /> {isFav ? 'Saved' : 'Save'}
                  </Button>
                )}
              </div>
            </div>
          </Card>
          {data.deliversToSelectedLocation === false && (
            <div className="mb-4">
              <Notice tone="red" title="Does not deliver to your selected location">
                You can browse, but you cannot order from this store for delivery to your current address.
              </Notice>
            </div>
          )}
          {data.store.verticals.includes('CHEMIST') && (
            <div className="mb-4">
              <Notice tone="orange" title="Pharmacy orders">
                Prescription medicines are dispensed only after a registered pharmacist reviews a valid prescription. This demo pharmacy and its reviews are simulated.
              </Notice>
            </div>
          )}
          {data.deliversToSelectedLocation !== false && <ProductListing storeId={data.store.id} />}
          {data.reviews.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-3 text-lg font-bold">Recent ratings</h2>
              <ul className="grid gap-3 md:grid-cols-2">
                {data.reviews.map((r) => (
                  <li key={r.id}>
                    <Card>
                      <p className="font-semibold">
                        {'★'.repeat(r.rating)}
                        <span className="text-navy-100">{'★'.repeat(5 - r.rating)}</span> <span className="text-sm text-navy-700/80">· {r.author}</span>
                      </p>
                      {r.comment && <p className="mt-1 text-sm">{r.comment}</p>}
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </AppShell>
  );
}
