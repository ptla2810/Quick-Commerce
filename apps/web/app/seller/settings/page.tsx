'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { DOCUMENT_TYPES, formatMinuteOfDay } from '@padosi/shared';
import { SellerShell, useSellerStore } from '@/components/seller';
import { useToast } from '@/components/providers/toast';
import { api, useApi } from '@/lib/api';
import { Badge, Button, Card, Checkbox, Input, Notice, PageTitle, SectionHeader, Select, VerificationBadge } from '@/components/ui';

interface Org {
  id: string;
  name: string;
  verificationStatus: string;
  reviewNotes: string | null;
  licences: { id: string; type: string; number: string; status: string; isSimulated: boolean; validUntil: string | null }[];
  documents: { id: string; type: string; status: string; createdAt: string }[];
  stores: { id: string; openMinute: number; closeMinute: number; isTemporarilyClosed: boolean; deliveryRadiusKm: number; minOrderValue: number; baseDeliveryFee: number; freeDeliveryAbove: number; prepTimeMins: number; pickupEnabled: boolean }[];
}

const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const toMin = (t: string) => Number(t.split(':')[0]) * 60 + Number(t.split(':')[1]);

function SettingsInner() {
  const welcome = useSearchParams().get('welcome');
  const { store } = useSellerStore();
  const toast = useToast();
  const me = useApi<{ memberships: { org: Org }[] }>('/seller/me');
  const org = me.data?.memberships.find((m) => m.org.id === store?.orgId)?.org;
  const s = org?.stores.find((x) => x.id === store?.id);
  const [f, setF] = useState<Record<string, string>>({});
  const [closed, setClosed] = useState(false);
  const [pickup, setPickup] = useState(true);
  const [docType, setDocType] = useState('GST_CERTIFICATE');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!s) return;
    setF({ open: toTime(s.openMinute), close: toTime(s.closeMinute), radius: String(s.deliveryRadiusKm), minOrder: String(s.minOrderValue / 100), fee: String(s.baseDeliveryFee / 100), freeAbove: String(s.freeDeliveryAbove / 100), prep: String(s.prepTimeMins) });
    setClosed(s.isTemporarilyClosed);
    setPickup(s.pickupEnabled);
  }, [s]);

  if (!org || !s) return null;
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <PageTitle title="Store settings" />
      {welcome && (
        <div className="mb-4">
          <Notice tone="green" title="Application submitted">
            Upload your licence and GST documents below. Our team will review and approve your store.
          </Notice>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <SectionHeader title="Operations" />
          <Checkbox label="Temporarily closed (pause new orders)" checked={closed} onChange={setClosed} />
          <Checkbox label="Allow store pickup" checked={pickup} onChange={setPickup} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Opens" type="time" value={f.open ?? ''} onChange={set('open')} hint={f.open === f.close ? 'Same time = open 24 hours' : undefined} />
            <Input label="Closes" type="time" value={f.close ?? ''} onChange={set('close')} />
            <Input label="Delivery radius (km)" type="number" step="0.5" value={f.radius ?? ''} onChange={set('radius')} />
            <Input label="Preparation time (min)" type="number" value={f.prep ?? ''} onChange={set('prep')} />
            <Input label="Minimum order ₹" type="number" value={f.minOrder ?? ''} onChange={set('minOrder')} />
            <Input label="Delivery fee ₹" type="number" value={f.fee ?? ''} onChange={set('fee')} />
            <Input label="Free delivery above ₹" type="number" value={f.freeAbove ?? ''} onChange={set('freeAbove')} hint="0 = never free" />
          </div>
          <p className="text-xs text-navy-700/70">Currently {s.openMinute === s.closeMinute ? 'open 24 hours' : `${formatMinuteOfDay(s.openMinute)} – ${formatMinuteOfDay(s.closeMinute)}`} (IST).</p>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api(`/seller/stores/${s.id}`, {
                  method: 'PATCH',
                  body: {
                    isTemporarilyClosed: closed,
                    pickupEnabled: pickup,
                    openMinute: toMin(f.open),
                    closeMinute: toMin(f.close),
                    deliveryRadiusKm: Number(f.radius),
                    prepTimeMins: Number(f.prep),
                    minOrderValue: Math.round(Number(f.minOrder) * 100),
                    baseDeliveryFee: Math.round(Number(f.fee) * 100),
                    freeDeliveryAbove: Math.round(Number(f.freeAbove) * 100),
                  },
                });
                toast.show('Settings saved');
                void me.reload();
              } catch (e) {
                toast.show((e as Error).message, 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            Save settings
          </Button>
        </Card>
        <Card className="space-y-3">
          <SectionHeader title="Verification" action={<VerificationBadge status={org.verificationStatus} />} />
          {org.reviewNotes && <Notice>{org.reviewNotes}</Notice>}
          <h3 className="text-sm font-semibold">Licences</h3>
          <ul className="space-y-1 text-sm">
            {org.licences.map((l) => (
              <li key={l.id}>
                {l.type.replace(/_/g, ' ').toLowerCase()}: {l.number} <VerificationBadge status={l.status} /> {l.isSimulated && <Badge tone="orange">simulated</Badge>}
              </li>
            ))}
          </ul>
          <h3 className="text-sm font-semibold">Documents</h3>
          <ul className="space-y-1 text-sm">
            {org.documents.length === 0 && <li className="text-navy-700/70">No documents uploaded.</li>}
            {org.documents.map((d) => (
              <li key={d.id}>
                {d.type.replace(/_/g, ' ').toLowerCase()} · {new Date(d.createdAt).toLocaleDateString('en-IN')} <VerificationBadge status={d.status} />
              </li>
            ))}
          </ul>
          {store!.role === 'OWNER' || store!.role === 'MANAGER' ? (
            <form
              className="space-y-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!file) return;
                const fd = new FormData();
                fd.set('type', docType);
                fd.set('file', file);
                try {
                  await api(`/seller/orgs/${org.id}/documents`, { form: fd });
                  toast.show('Document uploaded');
                  setFile(null);
                  void me.reload();
                } catch (e) {
                  toast.show((e as Error).message, 'error');
                }
              }}
            >
              <Select label="Document type" value={docType} onChange={(e) => setDocType(e.target.value)}>
                {DOCUMENT_TYPES.map((d) => (
                  <option key={d} value={d}>
                    {d.replace(/_/g, ' ').toLowerCase()}
                  </option>
                ))}
              </Select>
              <input type="file" aria-label="Document file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-navy-50 file:px-3 file:py-2 file:font-semibold" />
              <Button type="submit" variant="secondary" disabled={!file}>
                Upload document
              </Button>
            </form>
          ) : null}
        </Card>
      </div>
    </>
  );
}

export default function SellerSettingsPage() {
  return (
    <SellerShell>
      <Suspense>
        <SettingsInner />
      </Suspense>
    </SellerShell>
  );
}
