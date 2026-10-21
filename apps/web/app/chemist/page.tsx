'use client';

import Link from 'next/link';
import { AppShell } from '@/components/shells';
import { ProductListing } from '@/components/listing';
import { useApi } from '@/lib/api';
import { Card, Notice, PageTitle } from '@/components/ui';

export default function ChemistPage() {
  const cats = useApi<{ categories: { id: string; slug: string; name: string; icon: string | null }[] }>('/catalog/categories?vertical=CHEMIST');
  return (
    <AppShell>
      <PageTitle title="Chemist" subtitle="Health essentials from licensed pharmacies near you" />
      <div className="mb-5 grid gap-3 md:grid-cols-[1fr_320px]">
        <Notice tone="orange" title="How medicine orders work">
          <ul className="mt-1 list-disc space-y-1 pl-4">
            <li>Over-the-counter items can be ordered directly.</li>
            <li>Prescription medicines need a valid prescription. A registered pharmacist reviews it before your order is accepted.</li>
            <li>We never auto-approve prescriptions or suggest substitutes without a pharmacist. Always follow your doctor’s advice.</li>
            <li>The pharmacy in this demo is a simulation; its licence and reviews are not real.</li>
          </ul>
        </Notice>
        <Card className="flex flex-col justify-between gap-3">
          <div>
            <p className="font-semibold">Have a prescription?</p>
            <p className="text-sm text-navy-700/80">Upload it once and use it at checkout.</p>
          </div>
          <Link href="/chemist/prescriptions" className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">
            Upload prescription
          </Link>
        </Card>
      </div>
      <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4">
        {cats.data?.categories.map((c) => (
          <Link key={c.id} href={`/category/${c.slug}`} className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-white px-3 text-sm font-semibold ring-1 ring-navy-100 hover:ring-brand-500">
            <span aria-hidden>{c.icon}</span> {c.name}
          </Link>
        ))}
      </div>
      <ProductListing vertical="CHEMIST" />
    </AppShell>
  );
}
