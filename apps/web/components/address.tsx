'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, useApi } from '@/lib/api';
import { useAuth } from './providers/auth';
import { Button, Input, Select } from './ui';

export interface City {
  id: string;
  name: string;
  state: string;
  lat: number;
  lng: number;
}
export interface Locality {
  id: string;
  name: string;
  postalCode: string;
  lat: number;
  lng: number;
  serviceable: boolean;
}
export interface Address {
  id: string;
  label: string;
  contactName: string;
  contactPhone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  postalCode: string;
  lat: number;
  lng: number;
  isDefault: boolean;
  serviceable: boolean;
  locality: { id: string; name: string; city: string };
}

export function useCitiesAndLocalities() {
  const cities = useApi<{ cities: City[] }>('/locations/cities');
  const [cityId, setCityId] = useState<string>('');
  useEffect(() => {
    if (!cityId && cities.data?.cities[0]) setCityId(cities.data.cities[0].id);
  }, [cities.data, cityId]);
  const localities = useApi<{ localities: Locality[] }>(cityId ? `/locations/cities/${cityId}/localities` : null);
  const city = useMemo(() => cities.data?.cities.find((c) => c.id === cityId) ?? null, [cities.data, cityId]);
  return { cities, cityId, setCityId, city, localities };
}

/** Saves a new delivery address. The PIN code must match the chosen locality. */
export function AddressForm({ onSaved, initialLocalityId }: { onSaved: (a: { id: string }) => void; initialLocalityId?: string }) {
  const { user } = useAuth();
  const { cities, cityId, setCityId, localities } = useCitiesAndLocalities();
  const [f, setF] = useState({ label: 'Home', contactName: user?.name ?? '', contactPhone: user?.phone ?? '', line1: '', line2: '', landmark: '', localityId: initialLocalityId ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loc = localities.data?.localities.find((l) => l.id === f.localityId);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!loc) return setErrors({ localityId: 'Choose your area' });
        setBusy(true);
        setErr(null);
        setErrors({});
        try {
          const r = await api<{ address: { id: string } }>('/me/addresses', {
            body: { ...f, line2: f.line2 || null, landmark: f.landmark || null, postalCode: loc.postalCode, lat: loc.lat, lng: loc.lng },
          });
          onSaved(r.address);
        } catch (e) {
          setErrors((e as ApiError).details?.fields ?? {});
          setErr((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Select label="City" value={cityId} onChange={(e) => setCityId(e.target.value)} required>
        {cities.data?.cities.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}, {c.state}
          </option>
        ))}
      </Select>
      <Select label="Area / locality" value={f.localityId} onChange={set('localityId')} error={errors.localityId} required>
        <option value="">Choose…</option>
        {localities.data?.localities.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name} ({l.postalCode}){l.serviceable ? '' : ' – not serviceable yet'}
          </option>
        ))}
      </Select>
      <div className="sm:col-span-2">
        <Input label="House / flat / shop, street" value={f.line1} onChange={set('line1')} error={errors.line1} required autoComplete="address-line1" />
      </div>
      <Input label="Building / area (optional)" value={f.line2} onChange={set('line2')} autoComplete="address-line2" />
      <Input label="Landmark (optional)" value={f.landmark} onChange={set('landmark')} hint="Helps the delivery partner find you" />
      <Input label="Contact name" value={f.contactName} onChange={set('contactName')} error={errors.contactName} required />
      <Input label="Contact mobile" inputMode="numeric" value={f.contactPhone} onChange={set('contactPhone')} error={errors.contactPhone} required />
      <Select label="Save as" value={f.label} onChange={set('label')}>
        <option>Home</option>
        <option>Work</option>
        <option>Shop</option>
        <option>Other</option>
      </Select>
      <Input label="PIN code" value={loc?.postalCode ?? ''} readOnly hint="Filled from your area" />
      {err && (
        <p role="alert" className="text-sm font-medium text-red-700 sm:col-span-2">
          {err}
        </p>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" loading={busy} block>
          Save address
        </Button>
      </div>
    </form>
  );
}
