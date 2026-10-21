'use client';

import { useState } from 'react';
import { VERTICALS } from '@padosi/shared';
import { AdminShell } from '@/components/admin';
import { useToast } from '@/components/providers/toast';
import { api, ApiError, useApi } from '@/lib/api';
import { money } from '@/components/commerce';
import { Badge, Button, Card, Checkbox, Input, Notice, PageTitle, SectionHeader, Select, Spinner } from '@/components/ui';

interface Coupon { id: string; code: string; description: string; discountType: string; value: number; maxDiscount: number | null; minOrderValue: number; vertical: string | null; isActive: boolean; validTo: string; firstOrderOnly: boolean; store: { name: string } | null; city: { name: string } | null; _count: { redemptions: number }; usageLimit: number | null }

const today = () => new Date().toISOString().slice(0, 10);

export default function CouponsPage() {
  const toast = useToast();
  const { data, loading, reload } = useApi<{ coupons: Coupon[] }>('/admin/coupons');
  const [f, setF] = useState({ code: '', description: '', discountType: 'PERCENT', value: '10', maxDiscount: '', minOrderValue: '0', vertical: '', validFrom: today(), validTo: '', usageLimit: '', perUserLimit: '1' });
  const [first, setFirst] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <AdminShell>
      <PageTitle title="Coupons & promotions" subtitle="Platform-wide coupons are platform-funded; store-specific coupons are seller-funded." />
      <Card className="mb-5">
        <SectionHeader title="Create coupon" />
        <form
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            try {
              await api('/admin/coupons', {
                body: {
                  code: f.code,
                  description: f.description,
                  discountType: f.discountType,
                  value: f.discountType === 'FLAT' ? Math.round(Number(f.value) * 100) : Number(f.value),
                  maxDiscount: f.maxDiscount ? Math.round(Number(f.maxDiscount) * 100) : null,
                  minOrderValue: Math.round(Number(f.minOrderValue) * 100),
                  vertical: f.vertical || null,
                  validFrom: new Date(f.validFrom).toISOString(),
                  validTo: new Date(`${f.validTo}T23:59:59`).toISOString(),
                  usageLimit: f.usageLimit ? Number(f.usageLimit) : null,
                  perUserLimit: Number(f.perUserLimit) || 1,
                  firstOrderOnly: first,
                },
              });
              toast.show('Coupon created');
              void reload();
            } catch (e) {
              setErr((e as ApiError).message);
            }
          }}
        >
          <Input label="Code" value={f.code} onChange={set('code')} required />
          <Input label="Description shown to customers" value={f.description} onChange={set('description')} required />
          <Select label="Type" value={f.discountType} onChange={set('discountType')}>
            <option value="PERCENT">Percentage</option>
            <option value="FLAT">Flat amount</option>
            <option value="FREE_DELIVERY">Free delivery</option>
          </Select>
          {f.discountType !== 'FREE_DELIVERY' && <Input label={f.discountType === 'PERCENT' ? 'Percent off' : 'Amount off ₹'} value={f.value} onChange={set('value')} />}
          {f.discountType === 'PERCENT' && <Input label="Max discount ₹" value={f.maxDiscount} onChange={set('maxDiscount')} />}
          <Input label="Minimum order ₹" value={f.minOrderValue} onChange={set('minOrderValue')} />
          <Select label="Vertical" value={f.vertical} onChange={set('vertical')}>
            <option value="">All</option>
            {VERTICALS.map((v) => <option key={v}>{v}</option>)}
          </Select>
          <Input label="Valid from" type="date" value={f.validFrom} onChange={set('validFrom')} />
          <Input label="Valid to" type="date" value={f.validTo} onChange={set('validTo')} required />
          <Input label="Total usage limit" value={f.usageLimit} onChange={set('usageLimit')} />
          <Input label="Uses per customer" value={f.perUserLimit} onChange={set('perUserLimit')} />
          <Checkbox label="First order only" checked={first} onChange={setFirst} />
          {err && <div className="sm:col-span-3"><Notice tone="red">{err}</Notice></div>}
          <div className="sm:col-span-3"><Button type="submit">Create coupon</Button></div>
        </form>
      </Card>
      {loading && <Spinner />}
      <div className="grid gap-3 md:grid-cols-2">
        {data?.coupons.map((c) => (
          <Card key={c.id} className={c.isActive ? '' : 'opacity-60'}>
            <div className="flex justify-between gap-2">
              <p className="font-mono font-bold">{c.code}</p>
              <Button size="sm" variant="ghost" onClick={async () => { await api(`/admin/coupons/${c.id}`, { method: 'PATCH', body: { isActive: !c.isActive } }); void reload(); }}>{c.isActive ? 'Disable' : 'Enable'}</Button>
            </div>
            <p className="text-sm">{c.description}</p>
            <p className="text-xs text-navy-700/80">
              {c.discountType === 'PERCENT' ? `${c.value}%` : c.discountType === 'FLAT' ? money(c.value) : 'Free delivery'} · min {money(c.minOrderValue)} · until {new Date(c.validTo).toLocaleDateString('en-IN')} · used {c._count.redemptions}{c.usageLimit ? `/${c.usageLimit}` : ''}
            </p>
            <div className="mt-1 space-x-1">
              {c.store ? <Badge tone="navy">seller-funded: {c.store.name}</Badge> : <Badge tone="gray">platform-funded</Badge>}
              {c.vertical && <Badge>{c.vertical.toLowerCase()}</Badge>}
              {c.firstOrderOnly && <Badge tone="orange">first order</Badge>}
            </div>
          </Card>
        ))}
      </div>
    </AdminShell>
  );
}
