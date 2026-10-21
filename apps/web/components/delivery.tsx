'use client';

import { useState, type ReactNode } from 'react';
import { MapPin, Navigation, Phone } from 'lucide-react';
import { PortalShell } from './shells';
import { api } from '@/lib/api';
import { useToast } from './providers/toast';
import { money } from './commerce';
import { Badge, Button, Card, Input, Modal, Select, Textarea } from './ui';

export function DeliveryShell({ children }: { children: ReactNode }) {
  return (
    <PortalShell
      portal="delivery"
      title="Delivery partner"
      nav={[
        { href: '/delivery', label: 'Today' },
        { href: '/delivery/history', label: 'History & earnings' },
      ]}
    >
      {children}
    </PortalShell>
  );
}

export interface Assignment {
  id: string;
  status: string;
  assignedAt: string;
  pickedUpAt: string | null;
  completedAt: string | null;
  earning: number;
  order: { id: string; orderNumber: string; status: string; itemCount: number; distanceKm: number | null; collectCash: number };
  store: { name: string; addressLine?: string; phone?: string; lat?: number; lng?: number };
  customer: { name: string | null; phone: string | null; address: string; lat: number | null; lng: number | null } | null;
  events: { status: string; issueType: string | null; note: string | null; at: string }[];
}

const mapsLink = (lat?: number | null, lng?: number | null) => (lat != null && lng != null ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` : null);

export function AssignmentCard({ a, onChange }: { a: Assignment; onChange: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [otpOpen, setOtpOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [otp, setOtp] = useState('');
  const [issue, setIssue] = useState({ issueType: 'CUSTOMER_UNAVAILABLE', note: '' });

  const send = async (body: Record<string, unknown>, label: string) => {
    setBusy(label);
    try {
      let coords: { lat?: number; lng?: number } = {};
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        coords = await new Promise((res) => navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res({}), { timeout: 3000 }));
      }
      await api(`/delivery/assignments/${a.id}/status`, { body: { ...body, ...coords } });
      toast.show('Updated');
      setOtpOpen(false);
      setIssueOpen(false);
      onChange();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const storeNav = mapsLink(a.store.lat, a.store.lng);
  const custNav = mapsLink(a.customer?.lat, a.customer?.lng);
  return (
    <Card as="article" label={`Delivery ${a.order.orderNumber}`} className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold">{a.order.orderNumber}</p>
          <p className="text-xs text-navy-700/80">
            {a.order.itemCount} items{a.order.distanceKm != null && ` · ${a.order.distanceKm} km`} · earning {money(a.earning)}
          </p>
        </div>
        <Badge tone={a.status === 'PICKED_UP' ? 'green' : a.status === 'ASSIGNED' ? 'orange' : 'blue'}>{a.status.replace('_', ' ').toLowerCase()}</Badge>
      </div>
      {a.order.collectCash > 0 && <p className="rounded-xl bg-accent-50 p-2 text-sm font-semibold">Collect cash: {money(a.order.collectCash)}</p>}
      <div className="rounded-xl bg-navy-50 p-3 text-sm">
        <p className="text-xs font-semibold uppercase text-navy-700/70">Pick up</p>
        <p className="font-semibold">{a.store.name}</p>
        {a.store.addressLine && <p>{a.store.addressLine}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          {a.store.phone && (
            <a href={`tel:${a.store.phone}`} className="inline-flex h-10 items-center gap-1 rounded-lg bg-white px-3 text-sm font-semibold ring-1 ring-navy-100">
              <Phone className="h-4 w-4" aria-hidden /> Call store
            </a>
          )}
          {storeNav && a.status !== 'PICKED_UP' && (
            <a href={storeNav} target="_blank" rel="noopener" className="inline-flex h-10 items-center gap-1 rounded-lg bg-white px-3 text-sm font-semibold ring-1 ring-navy-100">
              <Navigation className="h-4 w-4" aria-hidden /> Navigate
            </a>
          )}
        </div>
      </div>
      {a.customer && (
        <div className="rounded-xl bg-navy-50 p-3 text-sm">
          <p className="text-xs font-semibold uppercase text-navy-700/70">Drop</p>
          <p className="font-semibold">{a.customer.name ?? 'Customer'}</p>
          <p className="flex items-start gap-1">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {a.customer.address}
          </p>
          {a.status !== 'PICKED_UP' && <p className="mt-1 text-xs text-navy-700/70">Full address and phone appear after pickup.</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {a.status === 'PICKED_UP' && a.customer.phone && (
              <a href={`tel:${a.customer.phone}`} className="inline-flex h-10 items-center gap-1 rounded-lg bg-white px-3 text-sm font-semibold ring-1 ring-navy-100">
                <Phone className="h-4 w-4" aria-hidden /> Call customer
              </a>
            )}
            {custNav && (
              <a href={custNav} target="_blank" rel="noopener" className="inline-flex h-10 items-center gap-1 rounded-lg bg-white px-3 text-sm font-semibold ring-1 ring-navy-100">
                <Navigation className="h-4 w-4" aria-hidden /> Navigate
              </a>
            )}
          </div>
        </div>
      )}
      <div className="grid gap-2">
        {a.status === 'ASSIGNED' && (
          <Button size="lg" loading={busy === 'ack'} onClick={() => send({ status: 'ACCEPTED' }, 'ack')}>
            Accept delivery
          </Button>
        )}
        {(a.status === 'ASSIGNED' || a.status === 'ACCEPTED') && (
          <Button size="lg" variant={a.status === 'ASSIGNED' ? 'secondary' : 'primary'} loading={busy === 'pick'} disabled={!['READY_FOR_PICKUP', 'DELIVERY_FAILED'].includes(a.order.status)} onClick={() => send({ status: 'PICKED_UP' }, 'pick')}>
            {['READY_FOR_PICKUP', 'DELIVERY_FAILED'].includes(a.order.status) ? 'Confirm pickup' : 'Waiting for store to pack…'}
          </Button>
        )}
        {a.status === 'PICKED_UP' && (
          <Button size="lg" onClick={() => setOtpOpen(true)}>
            Mark delivered
          </Button>
        )}
        <Button variant="ghost" className="!text-red-700" onClick={() => setIssueOpen(true)}>
          {a.status === 'PICKED_UP' ? 'Report a problem' : 'Can’t take this delivery'}
        </Button>
      </div>

      <Modal open={otpOpen} onClose={() => setOtpOpen(false)} title="Proof of delivery">
        <div className="space-y-3">
          <p className="text-sm">Ask the customer for the 4-digit delivery code shown in their app.{a.order.collectCash > 0 && ` Collect ${money(a.order.collectCash)} in cash first.`}</p>
          <Input label="Delivery code" inputMode="numeric" maxLength={4} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} />
          <Button block size="lg" disabled={otp.length !== 4} loading={busy === 'done'} onClick={() => send({ status: 'DELIVERED', otp }, 'done')}>
            Complete delivery
          </Button>
        </div>
      </Modal>
      <Modal open={issueOpen} onClose={() => setIssueOpen(false)} title="Report an issue">
        <div className="space-y-3">
          <Select label="What happened?" value={issue.issueType} onChange={(e) => setIssue({ ...issue, issueType: e.target.value })}>
            <option value="CUSTOMER_UNAVAILABLE">Customer not available</option>
            <option value="WRONG_ADDRESS">Wrong / incomplete address</option>
            <option value="CUSTOMER_REFUSED">Customer refused the order</option>
            <option value="STORE_DELAY">Store is delayed</option>
            <option value="VEHICLE_ISSUE">Vehicle problem</option>
            <option value="OTHER">Other</option>
          </Select>
          <Textarea label="Details" value={issue.note} onChange={(e) => setIssue({ ...issue, note: e.target.value })} />
          <p className="text-xs text-navy-700/70">{a.status === 'PICKED_UP' ? 'The order will be marked as a failed attempt. Return the items to the store unless told otherwise.' : 'The delivery will be released so the store can assign someone else.'}</p>
          <Button block variant="danger" loading={busy === 'fail'} onClick={() => send({ status: 'FAILED', issueType: issue.issueType, note: issue.note || undefined }, 'fail')}>
            Submit
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
