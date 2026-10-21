'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Crosshair, MapPin } from 'lucide-react';
import { haversineKm } from '@padosi/shared';
import { AppShell } from '@/components/shells';
import { useLocation } from '@/components/providers/location';
import { useAuth } from '@/components/providers/auth';
import { useApi } from '@/lib/api';
import { AddressForm, useCitiesAndLocalities, type Address } from '@/components/address';
import { Badge, Button, Card, Modal, Notice, Select, Spinner } from '@/components/ui';

export default function LocationPage() {
  const router = useRouter();
  const { setLocation, location } = useLocation();
  const { user } = useAuth();
  const { cities, cityId, setCityId, city, localities } = useCitiesAndLocalities();
  const addresses = useApi<{ addresses: Address[] }>(user ? '/me/addresses' : null);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const chooseLocality = (id: string, lat?: number, lng?: number) => {
    const l = localities.data?.localities.find((x) => x.id === id);
    if (!l || !city) return;
    setLocation({ localityId: l.id, localityName: l.name, cityName: city.name, postalCode: l.postalCode, lat: lat ?? l.lat, lng: lng ?? l.lng });
    router.push('/');
  };
  const chooseAddress = (a: Address) => {
    setLocation({ localityId: a.locality.id, localityName: a.locality.name, cityName: a.locality.city, postalCode: a.postalCode, lat: a.lat, lng: a.lng, addressId: a.id, addressLabel: a.label });
    router.push('/');
  };

  const useGps = () => {
    if (!navigator.geolocation) return setGeoMsg('Location is not available on this device. Pick your area below.');
    setGeoMsg('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const list = localities.data?.localities ?? [];
        const nearest = list.map((l) => ({ l, d: haversineKm(here, l) })).sort((a, b) => a.d - b.d)[0];
        if (!nearest || nearest.d > 15) return setGeoMsg(`You seem to be outside ${city?.name ?? 'our cities'}. Pick an area below.`);
        setGeoMsg(null);
        chooseLocality(nearest.l.id, here.lat, here.lng);
      },
      () => setGeoMsg('Could not get your location. Allow location access or pick your area below.'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <AppShell hideSearch>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold">Choose delivery location</h1>
        <p className="mt-1 text-sm text-navy-700/80">We show only stores that deliver to your area, with stock and estimates for that location.</p>

        {user && (
          <section className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">Saved addresses</h2>
              <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
                Add address
              </Button>
            </div>
            {addresses.loading && <Spinner />}
            <div className="grid gap-2">
              {addresses.data?.addresses.map((a) => (
                <button key={a.id} onClick={() => chooseAddress(a)} className={`flex items-start gap-3 rounded-2xl bg-white p-3 text-left ring-1 ${location?.addressId === a.id ? 'ring-2 ring-brand-500' : 'ring-navy-100'} hover:ring-brand-500`}>
                  <MapPin className="mt-0.5 h-5 w-5 text-brand-600" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-semibold">
                      {a.label} {!a.serviceable && <Badge tone="red">Not serviceable</Badge>}
                    </span>
                    <span className="block truncate text-sm text-navy-700/80">
                      {a.line1}, {a.locality.name}, {a.locality.city} {a.postalCode}
                    </span>
                  </span>
                </button>
              ))}
              {addresses.data?.addresses.length === 0 && <p className="text-sm text-navy-700/70">No saved addresses yet.</p>}
            </div>
          </section>
        )}

        <Card className="mt-5 space-y-4">
          <Button variant="secondary" onClick={useGps} block>
            <Crosshair className="h-4 w-4" aria-hidden /> Use my current location
          </Button>
          {geoMsg && <Notice>{geoMsg}</Notice>}
          <Select label="City" value={cityId} onChange={(e) => setCityId(e.target.value)}>
            {cities.data?.cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}, {c.state}
              </option>
            ))}
          </Select>
          <div>
            <h2 className="mb-2 text-sm font-medium">Select your area</h2>
            {localities.loading && <Spinner />}
            <ul className="grid gap-2 sm:grid-cols-2">
              {localities.data?.localities.map((l) => (
                <li key={l.id}>
                  <button onClick={() => chooseLocality(l.id)} className="flex min-h-12 w-full items-center justify-between gap-2 rounded-xl bg-navy-50 px-3 py-2 text-left hover:bg-brand-50">
                    <span>
                      <span className="block text-sm font-semibold">{l.name}</span>
                      <span className="block text-xs text-navy-700/70">PIN {l.postalCode}</span>
                    </span>
                    {l.serviceable ? <Badge tone="green">Delivering</Badge> : <Badge tone="gray">Coming soon</Badge>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>
      <Modal open={adding} onClose={() => setAdding(false)} title="Add delivery address">
        {adding && (
          <AddressForm
            onSaved={async () => {
              setAdding(false);
              await addresses.reload();
            }}
          />
        )}
      </Modal>
    </AppShell>
  );
}
