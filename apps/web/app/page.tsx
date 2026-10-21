'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, LifeBuoy, MapPin, Tag } from 'lucide-react';
import { AppShell } from '@/components/shells';
import { useLocation } from '@/components/providers/location';
import { useAuth } from '@/components/providers/auth';
import { useApi } from '@/lib/api';
import { ProductRail, StoreCard } from '@/components/commerce';
import { Card, EmptyState, ErrorState, LinkButton, SectionHeader, Skeleton } from '@/components/ui';
import type { ProductCard, StoreSummary } from '@/lib/types';
import { BRAND } from '@/lib/brand';

const VERTICALS = [
  { href: '/c/grocery', title: 'Grocery', body: 'Daily essentials, fresh sabzi, dairy & staples', emoji: '🥬', cls: 'from-brand-50 to-brand-100' },
  { href: '/business', title: 'HoReCa', body: 'Bulk supplies for hotels, restaurants & caterers', emoji: '🍽️', cls: 'from-navy-50 to-navy-100' },
  { href: '/chemist', title: 'Chemist', body: 'Health essentials from licensed pharmacies', emoji: '💊', cls: 'from-sky-50 to-sky-100' },
];

interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
}

export default function HomePage() {
  const { location, ready, query } = useLocation();
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready || location) return;
    try {
      if (!localStorage.getItem('padosi.welcomed')) router.replace('/welcome');
    } catch {
      // storage unavailable
    }
  }, [ready, location, router]);

  const svc = useApi<{ serviceable: boolean; reason: string | null; stores: StoreSummary[] }>(location ? `/locations/serviceability?${query}` : null);
  const recs = useApi<{ frequent: ProductCard[]; recent: ProductCard[]; regional: ProductCard[]; personalised: boolean }>(location ? `/catalog/recommendations?${query}` : null);
  const cats = useApi<{ categories: Category[] }>('/catalog/categories?vertical=GROCERY');
  const coupons = useApi<{ coupons: { code: string; description: string; usedUp: boolean }[] }>(user ? '/me/coupons' : null);
  const bestCoupon = coupons.data?.coupons.find((c) => !c.usedUp);

  return (
    <AppShell>
      {!ready ? (
        <Skeleton className="h-40" />
      ) : !location ? (
        <Card className="flex flex-col items-start gap-3 bg-navy-800 p-6 text-white ring-0">
          <MapPin className="h-8 w-8 text-accent-500" aria-hidden />
          <h1 className="text-2xl font-bold">Where should we deliver?</h1>
          <p className="text-white/80">Choose your area to see stores, stock and delivery estimates near you.</p>
          <LinkButton href="/location" variant="accent">
            Select location
          </LinkButton>
        </Card>
      ) : null}

      <section aria-labelledby="verticals" className="mt-4">
        <h2 id="verticals" className="sr-only">
          Shop by need
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {VERTICALS.map((v) => (
            <Link key={v.href} href={v.href} className={`flex items-center gap-4 rounded-2xl bg-gradient-to-br ${v.cls} p-4 ring-1 ring-navy-100/70 hover:ring-brand-500`}>
              <span className="text-4xl" aria-hidden>
                {v.emoji}
              </span>
              <span>
                <span className="block text-lg font-bold text-navy-900">{v.title}</span>
                <span className="block text-sm text-navy-700/80">{v.body}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <Link href="/offers" className="mt-4 flex items-center justify-between gap-4 rounded-2xl bg-accent-500 p-5 text-navy-900">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide">Offers near you</p>
          <p className="mt-1 text-lg font-bold">{bestCoupon ? `Use ${bestCoupon.code}: ${bestCoupon.description}` : `Save on daily essentials from local stores`}</p>
        </div>
        <Tag className="h-8 w-8 shrink-0" aria-hidden />
      </Link>

      {location && svc.data && !svc.data.serviceable && (
        <div className="mt-6">
          <EmptyState icon="📍" title={svc.data.reason ?? 'Not serviceable yet'} body={`We are not delivering to ${location.localityName} yet. Try a nearby area or check back soon.`} action={<LinkButton href="/location">Change location</LinkButton>} />
        </div>
      )}

      <section className="mt-8">
        <SectionHeader title="Popular categories" action={<Link href="/categories" className="text-sm font-semibold text-brand-700">See all</Link>} />
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 lg:grid-cols-10">
          {cats.loading && Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-24" />)}
          {cats.data?.categories.map((c) => (
            <Link key={c.id} href={`/category/${c.slug}`} className="flex flex-col items-center gap-1 rounded-2xl bg-white p-2 text-center ring-1 ring-navy-100/70 hover:ring-brand-500">
              <span className="text-3xl" aria-hidden>
                {c.icon}
              </span>
              <span className="text-[11px] font-semibold leading-tight text-navy-800">{c.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {location && (
        <>
          <section className="mt-8">
            <SectionHeader title="Stores near you" subtitle={`Delivering to ${location.localityName}`} action={<Link href="/stores" className="text-sm font-semibold text-brand-700">All stores</Link>} />
            {svc.loading && <Skeleton className="h-24" />}
            {svc.error && <ErrorState error={svc.error} onRetry={svc.reload} />}
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{svc.data?.stores.slice(0, 6).map((s) => <StoreCard key={s.id} store={s} />)}</div>
          </section>

          {recs.loading && <Skeleton className="mt-8 h-64" />}
          {recs.data && recs.data.recent.length > 0 && (
            <section className="mt-8">
              <SectionHeader title="Order again" subtitle="From your recent orders" action={<Link href="/orders" className="text-sm font-semibold text-brand-700">Order history</Link>} />
              <ProductRail products={recs.data.recent} />
            </section>
          )}
          {recs.data && recs.data.frequent.length > 0 && (
            <section className="mt-8">
              <SectionHeader title={recs.data.personalised ? 'Frequently bought by you' : 'Popular in your area'} />
              <ProductRail products={recs.data.frequent} />
            </section>
          )}
          {recs.data && recs.data.regional.length > 0 && (
            <section className="mt-8">
              <SectionHeader title={`Local & regional favourites`} subtitle={`Made in and around ${location.cityName}`} />
              <ProductRail products={recs.data.regional} />
            </section>
          )}
        </>
      )}

      <section className="mt-8 grid gap-3 sm:grid-cols-2">
        <Link href="/support" className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-navy-100/70 hover:ring-brand-500">
          <LifeBuoy className="h-8 w-8 text-brand-600" aria-hidden />
          <span>
            <span className="block font-semibold">Need help?</span>
            <span className="block text-sm text-navy-700/80">FAQs, order issues and contact options</span>
          </span>
          <ArrowRight className="ml-auto h-5 w-5" aria-hidden />
        </Link>
        <Link href="/seller/onboarding" className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-navy-100/70 hover:ring-brand-500">
          <span className="text-3xl" aria-hidden>
            🏪
          </span>
          <span>
            <span className="block font-semibold">Own a shop? Sell on {BRAND.name}</span>
            <span className="block text-sm text-navy-700/80">Take orders from customers in your neighbourhood</span>
          </span>
          <ArrowRight className="ml-auto h-5 w-5" aria-hidden />
        </Link>
      </section>
    </AppShell>
  );
}
