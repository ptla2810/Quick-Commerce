'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell, RequireAuth } from '@/components/shells';
import { api, ApiError, useApi } from '@/lib/api';
import { Badge, Button, Card, DemoBadge, EmptyState, Input, Notice, PageTitle, SectionHeader, Spinner } from '@/components/ui';

interface Rx {
  id: string;
  patientName: string;
  doctorName: string | null;
  status: string;
  createdAt: string;
  file: { id: string; originalName: string; mimeType: string };
  reviews: { decision: string; notes: string; createdAt: string; isSimulated: boolean }[];
  approvedItems: { product: { name: string } }[];
  orders: { id: string; orderNumber: string; status: string }[];
}

const TONE: Record<string, 'green' | 'red' | 'orange' | 'gray'> = { APPROVED: 'green', REJECTED: 'red', PENDING_REVIEW: 'orange', EXPIRED: 'gray' };

function RxInner() {
  const ret = useSearchParams().get('return');
  const router = useRouter();
  const { data, loading, reload } = useApi<{ prescriptions: Rx[] }>('/me/prescriptions');
  const [file, setFile] = useState<File | null>(null);
  const [patient, setPatient] = useState('');
  const [doctor, setDoctor] = useState('');
  const [issuedOn, setIssuedOn] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <Card>
        <h2 className="mb-3 font-semibold">Upload a prescription</h2>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!file) return setErr('Choose a photo or PDF of your prescription');
            setBusy(true);
            setErr(null);
            try {
              const fd = new FormData();
              fd.set('file', file);
              fd.set('patientName', patient);
              if (doctor) fd.set('doctorName', doctor);
              if (issuedOn) fd.set('issuedOn', issuedOn);
              await api('/me/prescriptions', { form: fd });
              setFile(null);
              setPatient('');
              setDoctor('');
              await reload();
              if (ret?.startsWith('/')) router.push(ret);
            } catch (e) {
              setErr((e as ApiError).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div>
            <label htmlFor="rx-file" className="block text-sm font-medium">
              Prescription image or PDF <span className="text-red-700">*</span>
            </label>
            <input id="rx-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-navy-50 file:px-3 file:py-2 file:font-semibold" />
            <p className="mt-1 text-xs text-navy-700/70">JPG, PNG, WebP or PDF up to 5 MB. Make sure the doctor’s name, date and medicines are readable.</p>
          </div>
          <Input label="Patient name" value={patient} onChange={(e) => setPatient(e.target.value)} required />
          <Input label="Doctor’s name (optional)" value={doctor} onChange={(e) => setDoctor(e.target.value)} />
          <Input label="Date on prescription (optional)" type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
          {err && <Notice tone="red">{err}</Notice>}
          <Button type="submit" block loading={busy}>
            Upload securely
          </Button>
          <p className="text-xs text-navy-700/70">Prescriptions are stored privately. Only you and the pharmacist reviewing your order can view them.</p>
        </form>
      </Card>
      <section>
        <SectionHeader title="Your prescriptions" />
        {loading && <Spinner />}
        {data?.prescriptions.length === 0 && <EmptyState icon="📋" title="No prescriptions uploaded" />}
        <ul className="space-y-3">
          {data?.prescriptions.map((p) => (
            <li key={p.id}>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{p.patientName}</p>
                  <Badge tone={TONE[p.status]}>{p.status.replace('_', ' ').toLowerCase()}</Badge>
                </div>
                <p className="text-sm text-navy-700/80">
                  {p.doctorName && `${p.doctorName} · `}Uploaded {new Date(p.createdAt).toLocaleDateString('en-IN')} ·{' '}
                  <a className="text-brand-700 underline" href={`/api/me/files/${p.file.id}`} target="_blank" rel="noopener">
                    View file
                  </a>
                </p>
                {p.reviews[0] && (
                  <p className="mt-2 text-sm">
                    Pharmacist: {p.reviews[0].notes} {p.reviews[0].isSimulated && <DemoBadge label="Simulated review" />}
                  </p>
                )}
                {p.approvedItems.length > 0 && <p className="text-sm">Approved: {p.approvedItems.map((a) => a.product.name).join(', ')}</p>}
                {p.orders.map((o) => (
                  <Link key={o.id} href={`/orders/${o.id}`} className="mt-1 block text-sm text-brand-700 underline">
                    Order {o.orderNumber} ({o.status.replace(/_/g, ' ').toLowerCase()})
                  </Link>
                ))}
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function PrescriptionsPage() {
  return (
    <AppShell>
      <PageTitle title="Prescriptions" back="/chemist" />
      <RequireAuth>
        <Suspense>
          <RxInner />
        </Suspense>
      </RequireAuth>
    </AppShell>
  );
}
