'use client';

import { AdminShell } from '@/components/admin';
import { useToast } from '@/components/providers/toast';
import { api, useApi } from '@/lib/api';
import { money } from '@/components/commerce';
import { Badge, Button, Card, PageTitle, SectionHeader, Spinner } from '@/components/ui';

interface Data {
  settlements: { id: string; sellerOrg: { name: string }; periodStart: string; periodEnd: string; orderCount: number; grossSales: number; commissionAmount: number; netPayable: number; status: string; reference: string | null }[];
  unsettled: { sellerOrgId: string; sellerName: string; orders: number; sales: number; commission: number; payable: number }[];
}

export default function SettlementsPage() {
  const toast = useToast();
  const { data, loading, reload } = useApi<Data>('/admin/settlements');
  return (
    <AdminShell>
      <PageTitle title="Seller settlements" subtitle="Settlements group delivered orders. Marking one paid records the bank reference; money is not moved by this system." />
      {loading && <Spinner />}
      {data && (
        <div className="space-y-5">
          <Card>
            <SectionHeader title="Ready to settle" />
            {data.unsettled.length === 0 && <p className="text-sm text-navy-700/80">Nothing pending.</p>}
            <ul className="divide-y divide-navy-100 text-sm">
              {data.unsettled.map((u) => (
                <li key={u.sellerOrgId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <strong>{u.sellerName}</strong> · {u.orders} orders · sales {money(u.sales)} · commission {money(u.commission)}
                  </span>
                  <span className="flex items-center gap-3">
                    <strong className="tabular-nums">{money(u.payable)}</strong>
                    <Button size="sm" onClick={async () => { try { await api('/admin/settlements', { body: { sellerOrgId: u.sellerOrgId } }); void reload(); toast.show('Settlement created'); } catch (e) { toast.show((e as Error).message, 'error'); } }}>Create settlement</Button>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <SectionHeader title="Settlements" />
            <ul className="divide-y divide-navy-100 text-sm">
              {data.settlements.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <strong>{s.sellerOrg.name}</strong> · {new Date(s.periodStart).toLocaleDateString('en-IN')}–{new Date(s.periodEnd).toLocaleDateString('en-IN')} · {s.orderCount} orders · payable <strong>{money(s.netPayable)}</strong>
                    {s.reference && <span className="text-navy-700/70"> · ref {s.reference}</span>}
                  </span>
                  {s.status === 'PAID' ? (
                    <Badge tone="green">paid</Badge>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={async () => {
                      const reference = window.prompt('Bank/UTR reference for this payout');
                      if (!reference) return;
                      try { await api(`/admin/settlements/${s.id}/paid`, { body: { reference } }); void reload(); } catch (e) { toast.show((e as Error).message, 'error'); }
                    }}>Mark paid</Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </AdminShell>
  );
}
