'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SELLER_TYPES } from '@padosi/shared';
import { PortalShell } from '@/components/shells';
import { useAuth } from '@/components/providers/auth';
import { api, ApiError } from '@/lib/api';
import { useCitiesAndLocalities } from '@/components/address';
import { BRAND } from '@/lib/brand';
import { Button, Card, Checkbox, Input, Notice, PageTitle, SectionHeader, Select } from '@/components/ui';

const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export default function SellerOnboardingPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const { cities, cityId, setCityId, localities } = useCitiesAndLocalities();
  const [f, setF] = useState({ orgName: '', legalName: '', sellerType: 'GROCERY_RETAILER', gstin: '', contactPhone: '', contactEmail: '', storeName: '', addressLine: '', localityId: '', phone: '', open: '07:00', close: '22:00', radius: '3', fssai: '', drugLicence: '', drugValidUntil: '' });
  const [verticals, setVerticals] = useState<string[]>(['GROCERY']);
  const [serves, setServes] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const toggle = (arr: string[], v: string, setter: (a: string[]) => void) => setter(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const isPharmacy = f.sellerType === 'PHARMACY';
  const loc = localities.data?.localities.find((l) => l.id === f.localityId);

  return (
    <PortalShell portal="seller" title="Seller registration" nav={[{ href: '/seller/onboarding', label: 'Register' }]}>
      <PageTitle title={`Sell on ${BRAND.name}`} subtitle="Tell us about your business. Our team verifies every seller before the store goes live." />
      <form
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!loc) return setErrors({ 'store.localityId': 'Choose the store locality' });
          setBusy(true);
          setErr(null);
          setErrors({});
          const licences = [
            ...(f.fssai ? [{ type: 'FSSAI_LICENCE', number: f.fssai }] : []),
            ...(isPharmacy && f.drugLicence ? [{ type: 'DRUG_LICENCE', number: f.drugLicence, validUntil: f.drugValidUntil ? new Date(f.drugValidUntil).toISOString() : null }] : []),
          ];
          try {
            await api('/seller/onboarding', {
              body: {
                orgName: f.orgName,
                legalName: f.legalName,
                sellerType: f.sellerType,
                gstin: f.gstin || null,
                contactPhone: f.contactPhone,
                contactEmail: f.contactEmail,
                licences,
                store: {
                  name: f.storeName || f.orgName,
                  verticals: isPharmacy ? ['CHEMIST'] : verticals,
                  addressLine: f.addressLine,
                  localityId: loc.id,
                  postalCode: loc.postalCode,
                  lat: loc.lat,
                  lng: loc.lng,
                  phone: f.phone || f.contactPhone,
                  openMinute: toMinutes(f.open),
                  closeMinute: toMinutes(f.close),
                  deliveryRadiusKm: Number(f.radius),
                  serviceLocalityIds: serves.length ? serves : [loc.id],
                },
              },
            });
            await refresh();
            router.push('/seller/settings?welcome=1');
          } catch (e) {
            setErrors((e as ApiError).details?.fields ?? {});
            setErr((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Card className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><SectionHeader title="Business details" /></div>
          <Input label="Business / brand name" value={f.orgName} onChange={set('orgName')} error={errors.orgName} required />
          <Input label="Legal name" value={f.legalName} onChange={set('legalName')} error={errors.legalName} required />
          <Select label="Business type" value={f.sellerType} onChange={set('sellerType')}>
            {SELLER_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, ' ').toLowerCase()}
              </option>
            ))}
          </Select>
          <Input label="GSTIN (if registered)" value={f.gstin} onChange={set('gstin')} error={errors.gstin} />
          <Input label="Contact mobile" value={f.contactPhone} onChange={set('contactPhone')} error={errors.contactPhone} required />
          <Input label="Contact email" type="email" value={f.contactEmail} onChange={set('contactEmail')} error={errors.contactEmail} required />
        </Card>

        <Card className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><SectionHeader title="Store & service area" /></div>
          <Input label="Store name shown to customers" value={f.storeName} onChange={set('storeName')} placeholder={f.orgName} />
          <Input label="Store phone" value={f.phone} onChange={set('phone')} placeholder={f.contactPhone} />
          <Select label="City" value={cityId} onChange={(e) => setCityId(e.target.value)}>
            {cities.data?.cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select label="Store locality" value={f.localityId} onChange={set('localityId')} error={errors['store.localityId']} required>
            <option value="">Choose…</option>
            {localities.data?.localities.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.postalCode})
              </option>
            ))}
          </Select>
          <div className="sm:col-span-2">
            <Input label="Shop address" value={f.addressLine} onChange={set('addressLine')} required />
          </div>
          <Input label="Opens at" type="time" value={f.open} onChange={set('open')} />
          <Input label="Closes at" type="time" value={f.close} onChange={set('close')} />
          <Input label="Delivery radius (km)" type="number" min="0.5" max="25" step="0.5" value={f.radius} onChange={set('radius')} />
          {!isPharmacy && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">What will you sell?</legend>
              <Checkbox label="Grocery (retail)" checked={verticals.includes('GROCERY')} onChange={() => toggle(verticals, 'GROCERY', setVerticals)} />
              <Checkbox label="HoReCa (bulk / wholesale)" checked={verticals.includes('HORECA')} onChange={() => toggle(verticals, 'HORECA', setVerticals)} />
            </fieldset>
          )}
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm font-medium">Localities you can deliver to</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {localities.data?.localities.map((l) => (
                <Checkbox key={l.id} label={`${l.name}${l.serviceable ? '' : ' (not live yet)'}`} checked={serves.includes(l.id)} onChange={() => toggle(serves, l.id, setServes)} />
              ))}
            </div>
          </fieldset>
        </Card>

        <Card className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><SectionHeader title="Licences" subtitle="You can upload document copies after submitting." /></div>
          <Input label="FSSAI licence / registration no." value={f.fssai} onChange={set('fssai')} />
          {isPharmacy && (
            <>
              <Input label="Drug licence no. (Form 20/21)" value={f.drugLicence} onChange={set('drugLicence')} required error={errors.licences} />
              <Input label="Drug licence valid until" type="date" value={f.drugValidUntil} onChange={set('drugValidUntil')} />
              <div className="sm:col-span-2">
                <Notice tone="orange">Pharmacies must have a valid drug licence and a registered pharmacist on staff. Prescription medicines can only be dispensed after pharmacist review.</Notice>
              </div>
            </>
          )}
        </Card>
        {err && <Notice tone="red">{err}</Notice>}
        <Button type="submit" size="lg" loading={busy}>
          Submit application
        </Button>
      </form>
    </PortalShell>
  );
}
