'use client';

import Link from 'next/link';
import { AppShell } from '@/components/shells';
import { useApi } from '@/lib/api';
import { ErrorState, PageTitle, SectionHeader, Spinner } from '@/components/ui';

interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  vertical: string;
}

const TITLES: Record<string, string> = { GROCERY: 'Grocery', HORECA: 'HoReCa (business supplies)', CHEMIST: 'Chemist' };

export default function CategoriesPage() {
  const { data, error, loading, reload } = useApi<{ categories: Category[] }>('/catalog/categories');
  return (
    <AppShell>
      <PageTitle title="All categories" />
      {loading && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {(['GROCERY', 'HORECA', 'CHEMIST'] as const).map((v) => {
        const list = data?.categories.filter((c) => c.vertical === v) ?? [];
        if (!list.length) return null;
        return (
          <section key={v} className="mb-8">
            <SectionHeader title={TITLES[v]} />
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {list.map((c) => (
                <Link key={c.id} href={v === 'HORECA' ? `/business/catalogue?category=${c.slug}` : `/category/${c.slug}`} className="flex flex-col items-center gap-2 rounded-2xl bg-white p-3 text-center ring-1 ring-navy-100/70 hover:ring-brand-500">
                  <span className="text-4xl" aria-hidden>
                    {c.icon}
                  </span>
                  <span className="text-xs font-semibold leading-tight">{c.name}</span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </AppShell>
  );
}
