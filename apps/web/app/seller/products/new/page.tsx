'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DRUG_SCHEDULES, UNIT_TYPES } from '@padosi/shared';
import { SellerShell, useSellerStore } from '@/components/seller';
import { useToast } from '@/components/providers/toast';
import { api, ApiError, useApi } from '@/lib/api';
import { Button, Card, Checkbox, Input, Notice, PageTitle, SectionHeader, Select, Textarea } from '@/components/ui';

function NewProduct() {
  const { store } = useSellerStore();
  const router = useRouter();
  const toast = useToast();
  const cats = useApi<{ categories: { id: string; name: string; vertical: string }[] }>('/seller/categories');
  const [vertical, setVertical] = useState(store!.verticals[0]);
  const [f, setF] = useState({ name: '', categoryId: '', brandName: '', description: '', localNames: '', taxPct: '5', hsnCode: '', sku: '', variantName: '', unitType: 'PIECE', unitQuantity: '1', mrp: '', price: '', wholesalePrice: '', stockQty: '0', lowStock: '5', moq: '1', unitsPerCase: '' });
  const [rx, setRx] = useState({ schedule: 'OTC', genericName: '', strength: '', dosageForm: '', manufacturer: '' });
  const [regional, setRegional] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const paise = (s: string) => Math.round(Number(s || 0) * 100);

  return (
    <>
      <PageTitle title="Add a product" back="/seller/inventory" subtitle="New products appear to customers immediately and can be moderated by the platform." />
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          setErrors({});
          try {
            await api(`/seller/stores/${store!.id}/products`, {
              body: {
                name: f.name,
                categoryId: f.categoryId,
                brandName: f.brandName || null,
                vertical,
                description: f.description || null,
                localNames: f.localNames.split(',').map((s) => s.trim()).filter(Boolean),
                taxRateBps: Math.round(Number(f.taxPct) * 100),
                hsnCode: f.hsnCode || null,
                isRegional: regional,
                pharmacy: vertical === 'CHEMIST' ? { schedule: rx.schedule, genericName: rx.genericName || null, strength: rx.strength || null, dosageForm: rx.dosageForm || null, manufacturer: rx.manufacturer || null } : null,
                variant: { sku: f.sku, name: f.variantName, unitType: f.unitType, unitQuantity: Number(f.unitQuantity), mrp: paise(f.mrp), unitsPerCase: f.unitsPerCase ? Number(f.unitsPerCase) : null },
                inventory: { price: paise(f.price), wholesalePrice: f.wholesalePrice ? paise(f.wholesalePrice) : null, stockQty: Number(f.stockQty), lowStockThreshold: Number(f.lowStock), minOrderQty: Number(f.moq) || 1 },
              },
            });
            toast.show('Product added');
            router.push('/seller/inventory');
          } catch (e) {
            setErrors((e as ApiError).details?.fields ?? {});
            setErr((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Card className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><SectionHeader title="Product" /></div>
          {store!.verticals.length > 1 && (
            <Select label="Vertical" value={vertical} onChange={(e) => setVertical(e.target.value)}>
              {store!.verticals.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </Select>
          )}
          <Input label="Product name" value={f.name} onChange={set('name')} error={errors.name} required />
          <Select label="Category" value={f.categoryId} onChange={set('categoryId')} error={errors.categoryId} required>
            <option value="">Choose…</option>
            {cats.data?.categories.filter((c) => c.vertical === vertical).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Input label="Brand" value={f.brandName} onChange={set('brandName')} />
          <Input label="Local names / search terms" value={f.localNames} onChange={set('localNames')} hint="Comma separated, e.g. aloo, alu" />
          <Select label="GST rate" value={f.taxPct} onChange={set('taxPct')}>
            {['0', '5', '12', '18', '28'].map((t) => (
              <option key={t} value={t}>
                {t}%
              </option>
            ))}
          </Select>
          <Input label="HSN code" value={f.hsnCode} onChange={set('hsnCode')} />
          <div className="sm:col-span-2">
            <Textarea label="Description" value={f.description} onChange={set('description')} hint="Factual description only. Do not make health or medical claims." />
          </div>
          <Checkbox label="Local / regional product" checked={regional} onChange={setRegional} />
        </Card>
        {vertical === 'CHEMIST' && (
          <Card className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <SectionHeader title="Medicine details" />
              <Notice tone="orange">Schedule H and H1 medicines automatically require a prescription and pharmacist review. Schedule X and other restricted drugs cannot be listed.</Notice>
            </div>
            <Select label="Schedule" value={rx.schedule} onChange={(e) => setRx({ ...rx, schedule: e.target.value })}>
              {DRUG_SCHEDULES.map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ')}
                </option>
              ))}
            </Select>
            <Input label="Generic name / composition" value={rx.genericName} onChange={(e) => setRx({ ...rx, genericName: e.target.value })} />
            <Input label="Strength" value={rx.strength} onChange={(e) => setRx({ ...rx, strength: e.target.value })} />
            <Input label="Dosage form" value={rx.dosageForm} onChange={(e) => setRx({ ...rx, dosageForm: e.target.value })} />
            <Input label="Manufacturer" value={rx.manufacturer} onChange={(e) => setRx({ ...rx, manufacturer: e.target.value })} />
          </Card>
        )}
        <Card className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-3"><SectionHeader title="Pack, price & stock" /></div>
          <Input label="SKU" value={f.sku} onChange={set('sku')} error={errors['variant.sku']} required hint="Unique code, e.g. ATTA-5KG" />
          <Input label="Pack name" value={f.variantName} onChange={set('variantName')} required placeholder="5 kg" />
          <Select label="Unit" value={f.unitType} onChange={set('unitType')}>
            {UNIT_TYPES.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </Select>
          <Input label="Quantity per pack" inputMode="decimal" value={f.unitQuantity} onChange={set('unitQuantity')} />
          <Input label="Units per case (optional)" inputMode="numeric" value={f.unitsPerCase} onChange={set('unitsPerCase')} />
          <Input label="MRP ₹ (incl. taxes)" inputMode="decimal" value={f.mrp} onChange={set('mrp')} required />
          <Input label="Selling price ₹ (incl. GST)" inputMode="decimal" value={f.price} onChange={set('price')} error={errors['inventory.price']} required />
          {vertical === 'HORECA' && <Input label="Wholesale price ₹ (excl. GST)" inputMode="decimal" value={f.wholesalePrice} onChange={set('wholesalePrice')} />}
          {vertical === 'HORECA' && <Input label="Minimum order qty" inputMode="numeric" value={f.moq} onChange={set('moq')} />}
          <Input label="Opening stock" inputMode="numeric" value={f.stockQty} onChange={set('stockQty')} />
          <Input label="Low-stock alert at" inputMode="numeric" value={f.lowStock} onChange={set('lowStock')} />
        </Card>
        {err && <Notice tone="red">{err}</Notice>}
        <Button type="submit" size="lg" loading={busy}>
          Add product
        </Button>
      </form>
    </>
  );
}

export default function NewProductPage() {
  return (
    <SellerShell>
      <NewProduct />
    </SellerShell>
  );
}
