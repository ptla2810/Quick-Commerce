'use client';

import { AppShell } from '@/components/shells';
import { useLocation } from '@/components/providers/location';
import { useApi } from '@/lib/api';
import { StoreCard } from '@/components/commerce';
import { EmptyState, ErrorState, LinkButton, PageTitle, Spinner } from '@/components/ui';
import type { StoreSummary } from '@/lib/types';

export default function StoresPage() {
  const { location, query } = useLocation();
  const { data, error, loading, reload } = useApi<{ stores: StoreSummary[] }>(location ? `/stores/nearby?${query}` : null);
  return (
    <AppShell>
      <PageTitle title="Stores near you" subtitle={location ? `Delivering to ${location.localityName}, ${location.cityName}` : undefined} />
      {!location && <EmptyState icon="📍" title="Choose your location" action={<LinkButton href="/location">Select location</LinkButton>} />}
      {loading && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.stores.length === 0 && <EmptyState icon="🏪" title="No stores deliver here yet" body="We are adding stores in new areas every week." />}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{data?.stores.map((s) => <StoreCard key={s.id} store={s} />)}</div>
    </AppShell>
  );
}
