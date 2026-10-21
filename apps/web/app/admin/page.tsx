'use client';

import { useState } from 'react';
import { AdminShell } from '@/components/admin';
import { useApi } from '@/lib/api';
import { money } from '@/components/commerce';
import { BarList, ColumnChart } from '@/components/charts';
import { Card, ErrorState, Notice, PageTitle, SectionHeader, Spinner, Stat, Tabs } from '@/components/ui';

interface Metrics {
  periodDays: number;
  definitions: Record<string, string>;
  gmv: number;
  totalOrders: number;
  allOrdersCreated: number;
  averageOrderValue: number;
  activeCustomers: number;
  repeatPurchaseRate: number | null;
  activeSellers: number;
  approvedSellers: number;
  fulfilmentRate: number | null;
  onTimeDeliveryRate: number | null;
  cancellationRate: number | null;
  revenue: { commission: number; deliveryFees: number; platformRevenue: number; platformFundedDiscounts: number; deliveryPartnerPayouts: number; contribution: number; netProfit: null };
  sellerEarnings: number;
  ordersByStatus: Record<string, number>;
  byVertical: { vertical: string; gmv: number; orders: number }[];
  byLocality: { city: string; locality: string; orders: number; gmv: number }[];
  daily: { day: string; orders: number; gmv: number }[];
  simulatedPayments: boolean;
}

const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);

export default function AdminDashboard() {
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const { data, error, loading, reload } = useApi<Metrics>(`/admin/metrics?days=${days}`);
  return (
    <AdminShell>
      <PageTitle title="Platform overview" subtitle="All amounts include GST unless noted." action={<Tabs value={days} onChange={setDays} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />} />
      {loading && !data && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <div className="space-y-6">
          {data.simulatedPayments && <Notice tone="orange">Payments are simulated and the data shown is demo data. Do not use these numbers for business decisions.</Notice>}
          <section>
            <SectionHeader title="Volume" />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="GMV" value={money(data.gmv)} hint="Goods value of confirmed orders — not revenue" />
              <Stat label="Confirmed orders" value={data.totalOrders} hint={`${data.allOrdersCreated} created incl. cancelled`} />
              <Stat label="Average order value" value={money(data.averageOrderValue)} />
              <Stat label="Active customers" value={data.activeCustomers} hint={`Repeat purchase rate ${pct(data.repeatPurchaseRate)}`} />
              <Stat label="Active sellers" value={data.activeSellers} hint={`${data.approvedSellers} approved in total`} />
              <Stat label="Fulfilment rate" value={pct(data.fulfilmentRate)} hint="Delivered ÷ closed orders" />
              <Stat label="On-time delivery" value={pct(data.onTimeDeliveryRate)} hint="Delivered within the upper estimate" />
              <Stat label="Cancellation rate" value={pct(data.cancellationRate)} hint="Cancelled + rejected ÷ all orders" />
            </div>
          </section>
          <section>
            <SectionHeader title="Money" subtitle="GMV, platform revenue, seller earnings and profit are different numbers." />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Platform revenue" value={money(data.revenue.platformRevenue)} hint={`Commission ${money(data.revenue.commission)} + delivery fees ${money(data.revenue.deliveryFees)}`} tone="green" />
              <Stat label="Contribution" value={money(data.revenue.contribution)} hint={`After ${money(data.revenue.platformFundedDiscounts)} discounts and ${money(data.revenue.deliveryPartnerPayouts)} rider payouts`} />
              <Stat label="Seller earnings" value={money(data.sellerEarnings)} hint="Owed to sellers after commission" />
              <Stat label="Net profit" value="Not calculated" hint="Needs operating costs (salaries, marketing, hosting, gateway fees)" />
            </div>
            <details className="mt-3 text-sm text-navy-700/80">
              <summary className="cursor-pointer font-semibold">Metric definitions</summary>
              <dl className="mt-2 space-y-1">
                {Object.entries(data.definitions).map(([k, v]) => (
                  <div key={k}>
                    <dt className="inline font-semibold">{k}: </dt>
                    <dd className="inline">{v}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </section>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <ColumnChart
                title="Daily GMV"
                data={data.daily.map((d) => ({ label: new Date(d.day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), value: d.gmv, detail: `${d.orders} orders` }))}
                format={money}
              />
            </Card>
            <Card>
              <BarList title="GMV by vertical" data={data.byVertical.map((v) => ({ label: v.vertical.charAt(0) + v.vertical.slice(1).toLowerCase(), value: v.gmv, detail: `${v.orders} orders` }))} format={money} />
            </Card>
            <Card>
              <BarList title="Top localities by GMV" data={data.byLocality.slice(0, 8).map((l) => ({ label: `${l.locality}, ${l.city}`, value: l.gmv, detail: `${l.orders} orders` }))} format={money} />
            </Card>
            <Card>
              <SectionHeader title="Orders by status" />
              <ul className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(data.ordersByStatus).map(([s, n]) => (
                  <li key={s} className="flex justify-between rounded-lg bg-navy-50 px-3 py-2">
                    <span>{s.replace(/_/g, ' ').toLowerCase()}</span>
                    <span className="font-semibold tabular-nums">{n}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
