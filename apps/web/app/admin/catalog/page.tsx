'use client';

import { useState } from 'react';
import { VERTICALS } from '@padosi/shared';
import { AdminShell } from '@/components/admin';
import { useToast } from '@/components/providers/toast';
import { api, useApi } from '@/lib/api';
import { Badge, Button, Card, Input, PageTitle, SectionHeader, Select, Spinner } from '@/components/ui';

interface Data {
  categories: { id: string; name: string; vertical: string; icon: string | null; isActive: boolean; parentId: string | null; _count: { products: number } }[];
  brands: { id: string; name: string; _count: { products: number } }[];
  products: { id: string; name: string; vertical: string; isActive: boolean; isRestricted: boolean; requiresPrescription: boolean; schedule: string | null; isDemo: boolean; category: { name: string } }[];
}

export default function CatalogAdminPage() {
  const toast = useToast();
  const { data, loading, reload } = useApi<Data>('/admin/catalog');
  const [cat, setCat] = useState({ name: '', vertical: 'GROCERY', icon: '' });
  const [brand, setBrand] = useState('');
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await reload();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  };
  return (
    <AdminShell>
      <PageTitle title="Catalogue" subtitle="Categories, brands and product moderation" />
      {loading && <Spinner />}
      {data && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <SectionHeader title="Categories" />
            <ul className="max-h-96 divide-y divide-navy-100 overflow-y-auto text-sm">
              {data.categories.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2">
                  <span>
                    {c.icon} {c.name} <Badge tone="gray">{c.vertical.toLowerCase()}</Badge> <span className="text-navy-700/60">{c._count.products} products</span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => run(() => api(`/admin/categories/${c.id}`, { method: 'PATCH', body: { isActive: !c.isActive } }))}>
                    {c.isActive ? 'Hide' : 'Show'}
                  </Button>
                </li>
              ))}
            </ul>
            <form className="mt-3 grid gap-2 sm:grid-cols-4 sm:items-end" onSubmit={(e) => { e.preventDefault(); run(() => api('/admin/categories', { body: { name: cat.name, vertical: cat.vertical, icon: cat.icon || undefined } })); }}>
              <Input label="New category" value={cat.name} onChange={(e) => setCat({ ...cat, name: e.target.value })} />
              <Select label="Vertical" value={cat.vertical} onChange={(e) => setCat({ ...cat, vertical: e.target.value })}>
                {VERTICALS.map((v) => <option key={v}>{v}</option>)}
              </Select>
              <Input label="Emoji" value={cat.icon} onChange={(e) => setCat({ ...cat, icon: e.target.value })} />
              <Button type="submit" variant="secondary">Add</Button>
            </form>
          </Card>
          <Card>
            <SectionHeader title="Brands" />
            <ul className="max-h-60 overflow-y-auto text-sm">
              {data.brands.map((b) => <li key={b.id} className="py-1">{b.name} <span className="text-navy-700/60">({b._count.products})</span></li>)}
            </ul>
            <form className="mt-3 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(() => api('/admin/brands', { body: { name: brand } })); setBrand(''); }}>
              <Input label="New brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
              <Button type="submit" variant="secondary">Add</Button>
            </form>
          </Card>
          <Card className="lg:col-span-2">
            <SectionHeader title="Product moderation" subtitle="Deactivate listings or mark a product restricted so it can never be sold." />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-xs uppercase"><tr><th className="py-2">Product</th><th>Category</th><th>Flags</th><th /></tr></thead>
                <tbody className="divide-y divide-navy-100">
                  {data.products.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2">{p.name}</td>
                      <td>{p.category.name}</td>
                      <td className="space-x-1">
                        {!p.isActive && <Badge tone="gray">inactive</Badge>}
                        {p.isRestricted && <Badge tone="red">restricted</Badge>}
                        {p.requiresPrescription && <Badge tone="orange">Rx</Badge>}
                        {p.isDemo && <Badge tone="orange">demo</Badge>}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        <Button size="sm" variant="ghost" onClick={() => run(() => api(`/admin/products/${p.id}`, { method: 'PATCH', body: { isActive: !p.isActive } }))}>{p.isActive ? 'Deactivate' : 'Activate'}</Button>
                        <Button size="sm" variant="ghost" onClick={() => run(() => api(`/admin/products/${p.id}`, { method: 'PATCH', body: { isRestricted: !p.isRestricted } }))}>{p.isRestricted ? 'Unrestrict' : 'Restrict'}</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </AdminShell>
  );
}
