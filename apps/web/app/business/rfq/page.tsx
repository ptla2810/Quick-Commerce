'use client';

import Link from 'next/link';
import { BusinessShell } from '@/components/business';
import { useApi } from '@/lib/api';
import { Badge, EmptyState, ErrorState, LinkButton, PageTitle, Spinner } from '@/components/ui';

interface Rfq {
  id: string;
  rfqNumber: string;
  title: string;
  status: string;
  createdAt: string;
  neededBy: string | null;
  deliveryLocality: { name: string };
  _count: { items: number; quotations: number };
}

const TONE: Record<string, 'green' | 'orange' | 'gray' | 'blue'> = { OPEN: 'orange', QUOTED: 'blue', ACCEPTED: 'green', CLOSED: 'gray', CANCELLED: 'gray' };

export default function RfqListPage() {
  const { data, error, loading, reload } = useApi<{ rfqs: Rfq[] }>('/business/rfqs');
  return (
    <BusinessShell>
      <PageTitle title="Requests for quotation" subtitle="Ask local suppliers for prices on large or custom orders and compare their quotations." action={<LinkButton href="/business/rfq/new">New RFQ</LinkButton>} />
      {loading && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data?.rfqs.length === 0 && <EmptyState icon="📨" title="No RFQs yet" action={<LinkButton href="/business/rfq/new">Create your first RFQ</LinkButton>} />}
      <ul className="space-y-3">
        {data?.rfqs.map((r) => (
          <li key={r.id}>
            <Link href={`/business/rfq/${r.id}`} className="block rounded-2xl bg-white p-4 ring-1 ring-navy-100/70 hover:ring-brand-500">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{r.title}</p>
                <Badge tone={TONE[r.status]}>{r.status.toLowerCase()}</Badge>
              </div>
              <p className="text-sm text-navy-700/80">
                {r.rfqNumber} · {r._count.items} items · {r._count.quotations} quotation{r._count.quotations === 1 ? '' : 's'} · deliver to {r.deliveryLocality.name}
                {r.neededBy && ` · needed by ${new Date(r.neededBy).toLocaleDateString('en-IN')}`}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </BusinessShell>
  );
}
