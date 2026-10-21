'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DeliveryShell } from '@/components/delivery';
import { useAuth } from '@/components/providers/auth';
import { api } from '@/lib/api';
import { useCitiesAndLocalities } from '@/components/address';
import { Button, Card, Input, Notice, PageTitle, Select } from '@/components/ui';

export default function DeliveryRegisterPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const { cities } = useCitiesAndLocalities();
  const [f, setF] = useState({ cityId: '', vehicleType: 'MOTORCYCLE', vehicleNumber: '', drivingLicenceNumber: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <DeliveryShell>
      <PageTitle title="Register as a delivery partner" />
      <Card className="max-w-xl">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            try {
              await api('/delivery/register', { body: { ...f, cityId: f.cityId || cities.data?.cities[0]?.id, vehicleNumber: f.vehicleNumber || null, drivingLicenceNumber: f.drivingLicenceNumber || null } });
              await refresh();
              router.push('/delivery');
            } catch (e) {
              setErr((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Select label="City" value={f.cityId} onChange={(e) => setF({ ...f, cityId: e.target.value })}>
            {cities.data?.cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select label="Vehicle" value={f.vehicleType} onChange={(e) => setF({ ...f, vehicleType: e.target.value })}>
            <option value="BICYCLE">Bicycle</option>
            <option value="SCOOTER">Scooter</option>
            <option value="MOTORCYCLE">Motorcycle</option>
            <option value="E_RICKSHAW">E-rickshaw</option>
          </Select>
          <Input label="Vehicle registration number" value={f.vehicleNumber} onChange={(e) => setF({ ...f, vehicleNumber: e.target.value })} />
          <Input label="Driving licence number" value={f.drivingLicenceNumber} onChange={(e) => setF({ ...f, drivingLicenceNumber: e.target.value })} hint="Required for motorised vehicles" />
          <Notice>Our team verifies your ID and licence before you can go online. Document upload and background verification integrations are not yet automated.</Notice>
          {err && <Notice tone="red">{err}</Notice>}
          <Button type="submit" block loading={busy}>
            Submit for verification
          </Button>
        </form>
      </Card>
    </DeliveryShell>
  );
}
