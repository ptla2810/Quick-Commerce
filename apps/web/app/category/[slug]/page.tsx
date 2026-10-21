'use client';

import { use } from 'react';
import { AppShell } from '@/components/shells';
import { ProductListing } from '@/components/listing';
import { useApi } from '@/lib/api';
import { PageTitle } from '@/components/ui';

export default function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const cats = useApi<{ categories: { slug: string; name: string; icon: string | null; children: { slug: string; name: string }[] }[] }>('/catalog/categories');
  const cat = cats.data?.categories.find((c) => c.slug === slug);
  return (
    <AppShell>
      <PageTitle title={cat ? `${cat.icon ?? ''} ${cat.name}` : 'Category'} back="/categories" />
      <ProductListing category={slug} />
    </AppShell>
  );
}
