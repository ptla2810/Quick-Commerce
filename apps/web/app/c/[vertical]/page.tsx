'use client';

import Link from 'next/link';
import { use } from 'react';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shells';
import { ProductListing } from '@/components/listing';
import { useApi } from '@/lib/api';
import { PageTitle } from '@/components/ui';

const META: Record<string, { v: string; title: string; subtitle: string }> = {
  grocery: { v: 'GROCERY', title: 'Grocery', subtitle: 'Daily essentials from kirana stores near you' },
};

export default function VerticalPage({ params }: { params: Promise<{ vertical: string }> }) {
  const { vertical } = use(params);
  const meta = META[vertical];
  const cats = useApi<{ categories: { id: string; slug: string; name: string; icon: string | null }[] }>(meta ? `/catalog/categories?vertical=${meta.v}` : null);
  if (!meta) notFound();
  return (
    <AppShell>
      <PageTitle title={meta.title} subtitle={meta.subtitle} />
      <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4">
        {cats.data?.categories.map((c) => (
          <Link key={c.id} href={`/category/${c.slug}`} className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-white px-3 text-sm font-semibold ring-1 ring-navy-100 hover:ring-brand-500">
            <span aria-hidden>{c.icon}</span> {c.name}
          </Link>
        ))}
      </div>
      <ProductListing vertical={meta.v} />
    </AppShell>
  );
}
