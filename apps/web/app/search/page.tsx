'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/shells';
import { ProductListing } from '@/components/listing';
import { PageTitle } from '@/components/ui';

function SearchInner() {
  const q = useSearchParams().get('q') ?? '';
  return (
    <AppShell>
      <PageTitle title={q ? `Results for “${q}”` : 'Search'} subtitle="Search by product, brand, category or local name" />
      <ProductListing q={q} />
    </AppShell>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchInner />
    </Suspense>
  );
}
