'use client';

import { useState } from 'react';
import { AdminShell } from '@/components/admin';
import { useToast } from '@/components/providers/toast';
import { api, useApi } from '@/lib/api';
import { Badge, Button, Card, Input, PageTitle, SectionHeader, Spinner } from '@/components/ui';

interface City {
  id: string;
  name: string;
  state: string;
  stateCode: string;
  isActive: boolean;
  zones: { id: string; name: string; isActive: boolean }[];
  localities: { id: string; name: string; postalCode: string; zoneId: string | null; lat: number; lng: number; _count: { storeServiceAreas: number } }[];
}

export default function ZonesPage() {
  const toast = useToast();
  const { data, loading, reload } = useApi<{ cities: City[] }>('/admin/geo');
  const [newCity, setNewCity] = useState({ name: '', state: '', stateCode: '', lat: '', lng: '' });
  const [newZone, setNewZone] = useState<Record<string, string>>({});
  const [newLoc, setNewLoc] = useState<Record<string, { name: string; postalCode: string; lat: string; lng: string }>>({});
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await reload();
      toast.show('Saved');
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  };
  return (
    <AdminShell>
      <PageTitle title="Cities, zones & localities" subtitle="A locality is serviceable when it belongs to an active zone in an active city. Stores choose which localities they serve." />
      {loading && <Spinner />}
      <div className="space-y-6">
        {data?.cities.map((c) => (
          <Card key={c.id}>
            <SectionHeader
              title={`${c.name}, ${c.state}`}
              subtitle={`GST state code ${c.stateCode}`}
              action={
                <Button size="sm" variant={c.isActive ? 'ghost' : 'primary'} onClick={() => run(() => api(`/admin/cities/${c.id}`, { method: 'PATCH', body: { isActive: !c.isActive } }))}>
                  {c.isActive ? 'Pause city' : 'Launch city'}
                </Button>
              }
            />
            <div className="mb-3 flex flex-wrap gap-2">
              {c.zones.map((z) => (
                <button key={z.id} onClick={() => run(() => api(`/admin/zones/${z.id}`, { method: 'PATCH', body: { isActive: !z.isActive } }))} className="rounded-full px-3 py-1 text-sm ring-1 ring-navy-100 hover:bg-navy-50" title="Toggle zone">
                  {z.name} <Badge tone={z.isActive ? 'green' : 'gray'}>{z.isActive ? 'active' : 'paused'}</Badge>
                </button>
              ))}
              <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); run(() => api('/admin/zones', { body: { cityId: c.id, name: newZone[c.id] } })); }}>
                <input aria-label="New zone name" className="h-8 rounded-lg border-0 text-sm ring-1 ring-navy-100" placeholder="New zone" value={newZone[c.id] ?? ''} onChange={(e) => setNewZone({ ...newZone, [c.id]: e.target.value })} />
                <Button size="sm" type="submit" variant="secondary">Add</Button>
              </form>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs uppercase text-navy-700"><tr><th className="py-2">Locality</th><th>PIN</th><th>Stores serving</th><th>Zone</th></tr></thead>
                <tbody className="divide-y divide-navy-100">
                  {c.localities.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2">{l.name}</td>
                      <td>{l.postalCode}</td>
                      <td>{l._count.storeServiceAreas}</td>
                      <td>
                        <select aria-label={`Zone for ${l.name}`} className="rounded-lg border-0 py-1 text-sm ring-1 ring-navy-100" value={l.zoneId ?? ''} onChange={(e) => run(() => api(`/admin/localities/${l.id}`, { method: 'PATCH', body: { zoneId: e.target.value || null } }))}>
                          <option value="">Not serviceable</option>
                          {c.zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form className="mt-3 grid gap-2 sm:grid-cols-5 sm:items-end" onSubmit={(e) => { e.preventDefault(); const n = newLoc[c.id]; run(() => api('/admin/localities', { body: { cityId: c.id, name: n.name, postalCode: n.postalCode, lat: Number(n.lat), lng: Number(n.lng) } })); }}>
              {(['name', 'postalCode', 'lat', 'lng'] as const).map((k) => (
                <Input key={k} label={k === 'postalCode' ? 'PIN' : k === 'name' ? 'New locality' : k} value={newLoc[c.id]?.[k] ?? ''} onChange={(e) => setNewLoc({ ...newLoc, [c.id]: { ...(newLoc[c.id] ?? { name: '', postalCode: '', lat: '', lng: '' }), [k]: e.target.value } })} />
              ))}
              <Button type="submit" variant="secondary">Add locality</Button>
            </form>
          </Card>
        ))}
        <Card>
          <SectionHeader title="Add a city" subtitle="New cities start paused. Add zones and localities, onboard stores, then launch." />
          <form className="grid gap-2 sm:grid-cols-6 sm:items-end" onSubmit={(e) => { e.preventDefault(); run(() => api('/admin/cities', { body: { ...newCity, lat: Number(newCity.lat), lng: Number(newCity.lng) } })); }}>
            <Input label="City" value={newCity.name} onChange={(e) => setNewCity({ ...newCity, name: e.target.value })} />
            <Input label="State" value={newCity.state} onChange={(e) => setNewCity({ ...newCity, state: e.target.value })} />
            <Input label="GST state code" value={newCity.stateCode} onChange={(e) => setNewCity({ ...newCity, stateCode: e.target.value })} />
            <Input label="Lat" value={newCity.lat} onChange={(e) => setNewCity({ ...newCity, lat: e.target.value })} />
            <Input label="Lng" value={newCity.lng} onChange={(e) => setNewCity({ ...newCity, lng: e.target.value })} />
            <Button type="submit">Add city</Button>
          </form>
        </Card>
      </div>
    </AdminShell>
  );
}
