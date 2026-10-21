'use client';

import { DeliveryShell, type Assignment } from '@/components/delivery';
import { useApi } from '@/lib/api';
import { money } from '@/components/commerce';
import { Badge, Card, EmptyState, Notice, PageTitle, Spinner, Stat } from '@/components/ui';

export default function DeliveryHistoryPage() {
  const e = useApi<{ today: { deliveries: number; earnings: number }; last7Days: { deliveries: number; earnings: number }; allTime: { deliveries: number; earnings: number; failed: number }; note: string }>('/delivery/earnings');
  const h = useApi<{ assignments: Assignment[] }>('/delivery/assignments?scope=history');
  return (
    <DeliveryShell>
      <PageTitle title="History & earnings" />
      {e.data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Today" value={money(e.data.today.earnings)} hint={`${e.data.today.deliveries} deliveries`} />
            <Stat label="Last 7 days" value={money(e.data.last7Days.earnings)} hint={`${e.data.last7Days.deliveries} deliveries`} />
            <Stat label="All time" value={money(e.data.allTime.earnings)} hint={`${e.data.allTime.deliveries} deliveries`} />
            <Stat label="Failed attempts" value={e.data.allTime.failed} />
          </div>
          <div className="mt-3">
            <Notice>{e.data.note}</Notice>
          </div>
        </>
      )}
      <div className="mt-5 space-y-2">
        {h.loading && <Spinner />}
        {h.data?.assignments.length === 0 && <EmptyState icon="📋" title="No completed deliveries yet" />}
        {h.data?.assignments.map((a) => (
          <Card key={a.id} className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm">
              <p className="font-semibold">{a.order.orderNumber}</p>
              <p className="text-xs text-navy-700/80">
                {a.store.name} → {a.customer?.address ?? '—'} · {a.completedAt ? new Date(a.completedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold tabular-nums">{a.status === 'DELIVERED' ? money(a.earning) : '—'}</span>
              <Badge tone={a.status === 'DELIVERED' ? 'green' : a.status === 'FAILED' ? 'red' : 'gray'}>{a.status.toLowerCase()}</Badge>
            </div>
          </Card>
        ))}
      </div>
    </DeliveryShell>
  );
}
