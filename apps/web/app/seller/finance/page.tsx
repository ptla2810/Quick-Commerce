'use client';

import Link from 'next/link';
import { SellerShell, useSellerStore } from '@/components/seller';
import { useApi } from '@/lib/api';
import { money } from '@/components/commerce';
import { Badge, Card, ErrorState, PageTitle, SectionHeader, Spinner, Stat } from '@/components/ui';

function FinanceInner() {
  const { store } = useSellerStore();
  const s = useApi<{ settlements: { id: string; periodStart: string; periodEnd: string; orderCount: number; grossSales: number; commissionAmount: number; netPayable: number; status: string; reference: string | null; paidAt: string | null }[]; unsettled: { orders: number; sales: number; commission: number; earning: number } }>(store ? `/seller/orgs/${store.orgId}/settlements` : null);
  const r = useApi<{ returns: { id: string; status: string; reason: string; amount: number; createdAt: string; order: { id: string; orderNumber: string } }[] }>(store ? `/seller/stores/${store.id}/returns` : null);
  return (
    <>
      <PageTitle title="Payouts & returns" subtitle="Payouts are recorded by the platform team. Bank transfers are not automated in this MVP." />
      {s.loading && <Spinner />}
      {s.error && <ErrorState error={s.error} onRetry={s.reload} />}
      {s.data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Unsettled orders" value={s.data.unsettled.orders} />
            <Stat label="Unsettled sales" value={money(s.data.unsettled.sales)} />
            <Stat label="Commission" value={money(s.data.unsettled.commission)} />
            <Stat label="Next payout (est.)" value={money(s.data.unsettled.earning)} tone="green" />
          </div>
          <Card className="mt-5 overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="p-3 text-left font-semibold">Settlement history</caption>
              <thead className="bg-navy-50 text-left text-xs uppercase">
                <tr>
                  <th className="p-3">Period</th>
                  <th className="p-3 text-right">Orders</th>
                  <th className="p-3 text-right">Sales</th>
                  <th className="p-3 text-right">Commission</th>
                  <th className="p-3 text-right">Payout</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {s.data.settlements.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-3 text-navy-700/70">
                      No settlements yet.
                    </td>
                  </tr>
                )}
                {s.data.settlements.map((x) => (
                  <tr key={x.id}>
                    <td className="p-3">
                      {new Date(x.periodStart).toLocaleDateString('en-IN')} – {new Date(x.periodEnd).toLocaleDateString('en-IN')}
                    </td>
                    <td className="p-3 text-right">{x.orderCount}</td>
                    <td className="p-3 text-right tabular-nums">{money(x.grossSales)}</td>
                    <td className="p-3 text-right tabular-nums">{money(x.commissionAmount)}</td>
                    <td className="p-3 text-right font-semibold tabular-nums">{money(x.netPayable)}</td>
                    <td className="p-3">
                      <Badge tone={x.status === 'PAID' ? 'green' : 'orange'}>{x.status.toLowerCase()}</Badge>
                      {x.reference && <span className="block text-xs text-navy-700/70">Ref {x.reference}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
      <section className="mt-6">
        <SectionHeader title="Return requests" subtitle="Returns are decided by platform support; you are notified of each request." />
        {r.data?.returns.length === 0 && <p className="text-sm text-navy-700/80">No return requests.</p>}
        <ul className="space-y-2">
          {r.data?.returns.map((x) => (
            <li key={x.id}>
              <Card className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm">
                  <Link href={`/seller/orders/${x.order.id}`} className="font-semibold underline">
                    {x.order.orderNumber}
                  </Link>{' '}
                  · {x.reason} · {money(x.amount)}
                </span>
                <Badge tone={x.status === 'REQUESTED' ? 'orange' : x.status === 'REJECTED' ? 'gray' : 'green'}>{x.status.toLowerCase()}</Badge>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

export default function FinancePage() {
  return (
    <SellerShell>
      <FinanceInner />
    </SellerShell>
  );
}
