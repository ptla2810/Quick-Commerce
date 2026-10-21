'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { SellerShell, useSellerStore } from '@/components/seller';
import { useToast } from '@/components/providers/toast';
import { api, useApi } from '@/lib/api';
import { money, OrderTimeline, PriceLine } from '@/components/commerce';
import { Badge, Button, Card, Checkbox, ErrorState, Modal, Notice, PageTitle, Select, Spinner, StatusBadge, Textarea } from '@/components/ui';
import type { OrderDetail } from '@/lib/types';

type SellerOrder = OrderDetail & {
  prescriptionDetails: { id: string; fileId: string; patientName: string; doctorName: string | null; issuedOn: string | null; status: string } | null;
};

const ACTION_LABEL: Record<string, string> = {
  ACCEPTED: 'Accept order',
  PREPARING: 'Start packing',
  READY_FOR_PICKUP: 'Mark ready for pickup',
  DELIVERED: 'Customer collected order',
  REJECTED: 'Reject',
  CANCELLED: 'Cancel order',
};

function Detail({ id }: { id: string }) {
  const { store } = useSellerStore();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ order: SellerOrder; memberRole: string }>(`/seller/orders/${id}`);
  const partners = useApi<{ partners: { id: string; name: string; vehicleType: string; activeDeliveries: number }[] }>(store ? `/seller/stores/${store.id}/delivery-partners` : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [rx, setRx] = useState<{ decision: 'APPROVED' | 'REJECTED'; notes: string; approved: string[] } | null>(null);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;
  const o = data.order;
  const isPharmacist = data.memberRole === 'PHARMACIST';

  const transition = async (to: string, why?: string) => {
    setBusy(to);
    try {
      await api(`/seller/orders/${o.id}/transition`, { body: { to, reason: why } });
      toast.show('Order updated');
      setReasonFor(null);
      setReason('');
      await reload();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const actions = o.actions.nextStatuses.filter((s) => !(o.status === 'AWAITING_RX_REVIEW' && s !== 'REJECTED'));
  const canAssign = o.fulfilmentType === 'DELIVERY' && ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'DELIVERY_FAILED'].includes(o.status);
  const rxProducts = o.items.filter((i) => i.requiresPrescription);

  return (
    <>
      <PageTitle
        title={`Order ${o.orderNumber}`}
        back="/seller/orders"
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={o.status} /> {o.channel === 'BUSINESS' && <Badge tone="navy">Business · GSTIN {o.buyerGstin ?? '—'}</Badge>}
            <Badge tone="gray">{o.fulfilmentType === 'PICKUP' ? 'Store pickup' : 'Delivery'}</Badge>
            <Badge tone="gray">{o.paymentMethod.replace('_', ' ')} · {o.paymentStatus.replace('_', ' ').toLowerCase()}</Badge>
          </span>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {o.status === 'AWAITING_RX_REVIEW' && (
            <Card className="ring-2 ring-accent-500">
              <h2 className="font-semibold">Prescription review required</h2>
              {!isPharmacist ? (
                <Notice tone="orange">Only a registered pharmacist on your team can review this prescription. The order cannot be accepted until they approve it.</Notice>
              ) : (
                <>
                  {o.prescriptionDetails && (
                    <div className="mt-2 text-sm">
                      <p>
                        Patient: <strong>{o.prescriptionDetails.patientName}</strong>
                        {o.prescriptionDetails.doctorName && ` · Doctor: ${o.prescriptionDetails.doctorName}`}
                        {o.prescriptionDetails.issuedOn && ` · Dated ${new Date(o.prescriptionDetails.issuedOn).toLocaleDateString('en-IN')}`}
                      </p>
                      <a href={`/api/me/files/${o.prescriptionDetails.fileId}`} target="_blank" rel="noopener" className="font-semibold text-brand-700 underline">
                        Open prescription (access is logged)
                      </a>
                    </div>
                  )}
                  <p className="mt-2 text-sm">Prescription items in this order:</p>
                  <ul className="list-disc pl-5 text-sm">
                    {rxProducts.map((i) => (
                      <li key={i.id}>
                        {i.productName} ({i.variantName}) × {i.quantity}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex gap-2">
                    <Button onClick={() => setRx({ decision: 'APPROVED', notes: '', approved: [] })}>Approve</Button>
                    <Button variant="danger" onClick={() => setRx({ decision: 'REJECTED', notes: '', approved: [] })}>
                      Reject
                    </Button>
                  </div>
                </>
              )}
            </Card>
          )}
          <Card>
            <h2 className="mb-2 font-semibold">Items to pack</h2>
            <ul className="divide-y divide-navy-100">
              {o.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-3 py-2 text-sm">
                  <span>
                    <strong>{i.quantity} ×</strong> {i.productName} ({i.variantName}) <span className="text-navy-700/60">· {i.sku}</span>
                    {i.requiresPrescription && <Badge tone="orange" className="ml-1">Rx</Badge>}
                    {i.substitutionPref !== 'SIMILAR_ITEM' && <span className="block text-xs text-accent-700">If unavailable: {i.substitutionPref === 'CALL_ME' ? 'call customer' : 'remove item'}</span>}
                  </span>
                  <span className="tabular-nums">{money(i.netAmount)}</span>
                </li>
              ))}
            </ul>
            {o.notes && <p className="mt-2 rounded-lg bg-accent-50 p-2 text-sm">Customer note: {o.notes}</p>}
          </Card>
          <Card>
            <h2 className="mb-2 font-semibold">Timeline</h2>
            <OrderTimeline status={o.status} events={o.events} fulfilmentType={o.fulfilmentType} />
          </Card>
        </div>
        <aside className="space-y-4">
          <Card className="space-y-2">
            <h2 className="font-semibold">Actions</h2>
            {actions.length === 0 && <p className="text-sm text-navy-700/80">No actions available in this status.</p>}
            {actions.map((s) =>
              s === 'REJECTED' || s === 'CANCELLED' ? (
                <Button key={s} block variant="ghost" className="!text-red-700" onClick={() => setReasonFor(s)}>
                  {ACTION_LABEL[s]}
                </Button>
              ) : (
                <Button key={s} block loading={busy === s} onClick={() => transition(s)}>
                  {ACTION_LABEL[s] ?? s}
                </Button>
              ),
            )}
          </Card>
          {o.fulfilmentType === 'DELIVERY' && (
            <Card className="space-y-2">
              <h2 className="font-semibold">Delivery</h2>
              {o.delivery ? (
                <p className="text-sm">
                  Assigned to <strong>{o.delivery.partnerName}</strong> ({o.delivery.status.toLowerCase().replace('_', ' ')})
                </p>
              ) : (
                <p className="text-sm text-navy-700/80">No delivery partner assigned yet.</p>
              )}
              {canAssign && (
                <>
                  <Select label={o.delivery ? 'Reassign to' : 'Assign to'} value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
                    <option value="">Choose an online partner…</option>
                    {partners.data?.partners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.vehicleType.toLowerCase()} · {p.activeDeliveries} active
                      </option>
                    ))}
                  </Select>
                  {partners.data?.partners.length === 0 && <p className="text-xs text-red-700">No delivery partners are online right now.</p>}
                  <Button
                    block
                    variant="secondary"
                    disabled={!partnerId}
                    loading={busy === 'assign'}
                    onClick={async () => {
                      setBusy('assign');
                      try {
                        await api(`/seller/orders/${o.id}/assign`, { body: { deliveryPartnerId: partnerId } });
                        toast.show('Delivery partner assigned');
                        await reload();
                      } catch (e) {
                        toast.show((e as Error).message, 'error');
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    Assign delivery
                  </Button>
                </>
              )}
              {o.deliveryAddress && (
                <p className="text-xs text-navy-700/70">
                  Deliver to {String(o.deliveryAddress.contactName)}, {String(o.deliveryAddress.locality)} {String(o.deliveryAddress.postalCode)}. Full address is shared with the assigned partner only.
                </p>
              )}
            </Card>
          )}
          <Card className="space-y-1">
            <h2 className="font-semibold">Amounts</h2>
            <PriceLine label="Items" value={money(o.totals.itemsSubtotal)} />
            {o.totals.discount > 0 && <PriceLine label="Discount" value={`− ${money(o.totals.discount)}`} />}
            <PriceLine label="Delivery fee (platform)" value={money(o.totals.deliveryFee)} />
            <PriceLine label="Customer pays" value={money(o.totals.grandTotal)} strong />
            <hr className="border-navy-100" />
            <PriceLine label={`Commission (${(o.totals.commissionRateBps ?? 0) / 100}%)`} value={`− ${money(o.totals.commissionAmount)}`} />
            <PriceLine label="Your earning" value={money(o.totals.sellerEarning)} strong tone="green" />
          </Card>
        </aside>
      </div>

      <Modal open={!!reasonFor} onClose={() => setReasonFor(null)} title={reasonFor === 'REJECTED' ? 'Reject order' : 'Cancel order'}>
        <div className="space-y-3">
          <Select label="Reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Choose…</option>
            <option>Items out of stock</option>
            <option>Store closing early</option>
            <option>Cannot deliver to this address</option>
            <option>Suspected fraudulent order</option>
            <option>Other</option>
          </Select>
          <p className="text-sm text-navy-700/80">The customer is notified and any online payment is refunded. Stock is restored automatically.</p>
          <Button variant="danger" block disabled={!reason} loading={busy === reasonFor} onClick={() => transition(reasonFor!, reason)}>
            Confirm
          </Button>
        </div>
      </Modal>

      <Modal open={!!rx} onClose={() => setRx(null)} title={rx?.decision === 'APPROVED' ? 'Approve prescription' : 'Reject prescription'}>
        {rx && (
          <div className="space-y-3">
            {rx.decision === 'APPROVED' && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Confirm each medicine is covered by the prescription</legend>
                {rxProducts.map((i) => {
                  const pid = i.productId;
                  return <Checkbox key={i.id} label={`${i.productName} (${i.variantName}) × ${i.quantity}`} checked={rx.approved.includes(pid)} onChange={(v) => setRx({ ...rx, approved: v ? [...new Set([...rx.approved, pid])] : rx.approved.filter((x) => x !== pid) })} />;
                })}
              </fieldset>
            )}
            <Textarea label="Pharmacist notes (recorded)" value={rx.notes} onChange={(e) => setRx({ ...rx, notes: e.target.value })} required placeholder={rx.decision === 'APPROVED' ? 'e.g. Valid prescription, dosage checked' : 'e.g. Prescription is older than 6 months'} />
            <Button
              block
              variant={rx.decision === 'APPROVED' ? 'primary' : 'danger'}
              disabled={rx.notes.trim().length < 3 || (rx.decision === 'APPROVED' && rx.approved.length !== new Set(rxProducts.map((i) => i.productId)).size)}
              loading={busy === 'rx'}
              onClick={async () => {
                setBusy('rx');
                try {
                  await api(`/seller/orders/${o.id}/prescription-review`, { body: { decision: rx.decision, notes: rx.notes, approvedProductIds: rx.approved } });
                  toast.show(rx.decision === 'APPROVED' ? 'Prescription approved' : 'Prescription rejected');
                  setRx(null);
                  await reload();
                } catch (e) {
                  toast.show((e as Error).message, 'error');
                } finally {
                  setBusy(null);
                }
              }}
            >
              {rx.decision === 'APPROVED' ? 'Approve and release order' : 'Reject order'}
            </Button>
          </div>
        )}
      </Modal>
      <p className="mt-6 text-xs text-navy-700/60">
        <Link href="/seller/orders" className="underline">
          Back to orders
        </Link>
      </p>
    </>
  );
}

export default function SellerOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <SellerShell>
      <Detail id={id} />
    </SellerShell>
  );
}
