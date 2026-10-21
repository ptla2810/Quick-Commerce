'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BUSINESS_TYPES } from '@padosi/shared';
import { BusinessShell } from '@/components/business';
import { useAuth } from '@/components/providers/auth';
import { api, ApiError, useApi } from '@/lib/api';
import { useCitiesAndLocalities } from '@/components/address';
import { money } from '@/components/commerce';
import { Button, Card, ErrorState, Input, LinkButton, Notice, PageTitle, SectionHeader, Select, Spinner, Stat, VerificationBadge } from '@/components/ui';

interface Summary {
  profile: { businessName: string; verificationStatus: string; gstin: string | null };
  credit: { approved: boolean; limit: number; used: number; available: number; days: number };
  thisMonth: { spend: number; gst: number; orders: number };
  allTime: { spend: number; orders: number };
  openRfqs: number;
  topItems: { name: string; quantity: number; spend: number }[];
}

function Register({ onDone }: { onDone: () => void }) {
  const { cities } = useCitiesAndLocalities();
  const { refresh, user } = useAuth();
  const [f, setF] = useState({ businessName: '', legalName: '', businessType: 'RESTAURANT', gstin: '', fssaiNumber: '', billingAddress: '', cityId: '', contactPhone: user?.phone ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Card className="mx-auto max-w-2xl">
      <h2 className="text-lg font-bold">Register your business</h2>
      <p className="mb-4 text-sm text-navy-700/80">Hotels, restaurants, cafés, caterers and cloud kitchens get wholesale prices, bulk ordering, quotations and GST invoices after verification.</p>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          setErrors({});
          try {
            await api('/business/profile', { body: { ...f, gstin: f.gstin || null, fssaiNumber: f.fssaiNumber || null, cityId: f.cityId || cities.data?.cities[0]?.id } });
            await refresh();
            onDone();
          } catch (e) {
            setErrors((e as ApiError).details?.fields ?? {});
            setErr((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Input label="Business name" value={f.businessName} onChange={set('businessName')} error={errors.businessName} required />
        <Input label="Legal name (as on GST)" value={f.legalName} onChange={set('legalName')} error={errors.legalName} required />
        <Select label="Business type" value={f.businessType} onChange={set('businessType')}>
          {BUSINESS_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace('_', ' ').toLowerCase()}
            </option>
          ))}
        </Select>
        <Select label="City" value={f.cityId} onChange={set('cityId')}>
          {cities.data?.cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Input label="GSTIN (optional)" value={f.gstin} onChange={set('gstin')} error={errors.gstin} hint="Needed for GST input credit on invoices" />
        <Input label="FSSAI licence no. (optional)" value={f.fssaiNumber} onChange={set('fssaiNumber')} error={errors.fssaiNumber} />
        <div className="sm:col-span-2">
          <Input label="Billing address" value={f.billingAddress} onChange={set('billingAddress')} error={errors.billingAddress} required />
        </div>
        <Input label="Contact mobile" value={f.contactPhone} onChange={set('contactPhone')} error={errors.contactPhone} required />
        {err && <div className="sm:col-span-2"><Notice tone="red">{err}</Notice></div>}
        <div className="sm:col-span-2">
          <Button type="submit" loading={busy} block>
            Submit for verification
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Dashboard() {
  const { data, error, loading, reload } = useApi<Summary>('/business/summary');
  if (loading) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;
  const verified = data.profile.verificationStatus === 'APPROVED';
  return (
    <>
      <PageTitle title={data.profile.businessName} subtitle={<span className="flex items-center gap-2">Business account <VerificationBadge status={data.profile.verificationStatus} /> {data.profile.gstin && `· GSTIN ${data.profile.gstin}`}</span>} />
      {!verified && (
        <div className="mb-4">
          <Notice tone="orange" title="Verification pending">
            Our team is reviewing your details. You can browse the bulk catalogue at list prices now; wholesale prices, business ordering and RFQs unlock after approval.
          </Notice>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Spend this month" value={money(data.thisMonth.spend)} hint={`${data.thisMonth.orders} orders · GST ${money(data.thisMonth.gst)}`} />
        <Stat label="All-time spend" value={money(data.allTime.spend)} hint={`${data.allTime.orders} orders`} />
        <Stat label="Credit available" value={data.credit.approved ? money(data.credit.available) : 'Not approved'} hint={data.credit.approved ? `${money(data.credit.used)} used of ${money(data.credit.limit)} · ${data.credit.days}-day terms` : 'Ask our team for credit terms'} />
        <Stat label="Open RFQs" value={data.openRfqs} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeader title="Quick actions" />
          <div className="grid gap-2 sm:grid-cols-2">
            <LinkButton href="/business/catalogue">Order from bulk catalogue</LinkButton>
            <LinkButton href="/business/lists" variant="secondary">Reorder a saved list</LinkButton>
            <LinkButton href="/business/rfq/new" variant="secondary">Request a quotation</LinkButton>
            <LinkButton href="/business/orders" variant="secondary">Invoices</LinkButton>
          </div>
        </Card>
        <Card>
          <SectionHeader title="Top purchased items" />
          {data.topItems.length === 0 && <p className="text-sm text-navy-700/80">Your most-bought items will appear here.</p>}
          <ul className="divide-y divide-navy-100 text-sm">
            {data.topItems.map((t) => (
              <li key={t.name} className="flex justify-between py-2">
                <span>{t.name}</span>
                <span className="tabular-nums">
                  {t.quantity} · {money(t.spend)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

export default function BusinessPage() {
  const { user, refresh } = useAuth();
  return (
    <BusinessShell>
      {user?.businessProfile ? <Dashboard /> : <Register onDone={() => void refresh()} />}
      {user?.businessProfile && (
        <p className="mt-6 text-xs text-navy-700/70">
          Retail shopping stays available from the <Link href="/" className="underline">customer app</Link>.
        </p>
      )}
    </BusinessShell>
  );
}
