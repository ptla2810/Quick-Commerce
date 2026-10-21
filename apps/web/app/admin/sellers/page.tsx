'use client';

import { useState } from 'react';
import { AdminShell } from '@/components/admin';
import { useToast } from '@/components/providers/toast';
import { api, useApi } from '@/lib/api';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Modal, PageTitle, Select, Spinner, Tabs, Textarea, VerificationBadge } from '@/components/ui';

interface Seller {
  id: string;
  name: string;
  legalName: string;
  sellerType: string;
  gstin: string | null;
  contactPhone: string;
  contactEmail: string;
  verificationStatus: string;
  reviewNotes: string | null;
  commissionRateBps: number | null;
  isDemo: boolean;
  createdAt: string;
  stores: { id: string; name: string; verticals: string[]; isActive: boolean; locality: { name: string } }[];
  licences: { id: string; type: string; number: string; status: string; isSimulated: boolean; validUntil: string | null }[];
  documents: { id: string; type: string; status: string; fileId: string }[];
  members: { role: string; user: { name: string; phone: string | null } }[];
}

export default function AdminSellersPage() {
  const [status, setStatus] = useState<'PENDING' | 'APPROVED' | 'INFO_REQUIRED' | 'REJECTED' | ''>('PENDING');
  const { data, error, loading, reload } = useApi<{ sellers: Seller[] }>(`/admin/sellers${status ? `?status=${status}` : ''}`);
  const [review, setReview] = useState<Seller | null>(null);
  return (
    <AdminShell>
      <PageTitle title="Seller verification" />
      <Tabs value={status} onChange={setStatus} options={[{ value: 'PENDING', label: 'Pending' }, { value: 'INFO_REQUIRED', label: 'Info needed' }, { value: 'APPROVED', label: 'Approved' }, { value: 'REJECTED', label: 'Rejected' }, { value: '', label: 'All' }]} />
      <div className="mt-4 space-y-3">
        {loading && <Spinner />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {data?.sellers.length === 0 && <EmptyState icon="✅" title="Nothing to review" />}
        {data?.sellers.map((s) => (
          <Card key={s.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {s.name} {s.isDemo && <Badge tone="orange">demo</Badge>}
                </p>
                <p className="text-xs text-navy-700/80">
                  {s.legalName} · {s.sellerType.replace(/_/g, ' ').toLowerCase()} · GSTIN {s.gstin ?? '—'} · {s.contactPhone} · applied {new Date(s.createdAt).toLocaleDateString('en-IN')}
                </p>
                <p className="mt-1 text-sm">Stores: {s.stores.map((st) => `${st.name} (${st.locality.name}; ${st.verticals.join(', ')})`).join('; ')}</p>
                <p className="text-sm">
                  Licences:{' '}
                  {s.licences.length === 0
                    ? 'none'
                    : s.licences.map((l) => `${l.type.replace(/_/g, ' ').toLowerCase()} ${l.number}${l.isSimulated ? ' (simulated)' : ''}`).join(' · ')}
                </p>
                <p className="text-sm">
                  Documents:{' '}
                  {s.documents.length === 0
                    ? 'none uploaded'
                    : s.documents.map((d) => (
                        <a key={d.id} className="mr-2 text-brand-700 underline" href={`/api/me/files/${d.fileId}`} target="_blank" rel="noopener">
                          {d.type.replace(/_/g, ' ').toLowerCase()}
                        </a>
                      ))}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <VerificationBadge status={s.verificationStatus} />
                <Button size="sm" onClick={() => setReview(s)}>
                  Review
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
      {review && <ReviewModal seller={review} onClose={() => setReview(null)} onDone={() => { setReview(null); void reload(); }} />}
    </AdminShell>
  );
}

function ReviewModal({ seller, onClose, onDone }: { seller: Seller; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [decision, setDecision] = useState('APPROVED');
  const [notes, setNotes] = useState('');
  const [commission, setCommission] = useState(seller.commissionRateBps != null ? String(seller.commissionRateBps / 100) : '');
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={`Review ${seller.name}`}>
      <div className="space-y-3">
        {seller.sellerType === 'PHARMACY' && <p className="rounded-lg bg-accent-50 p-2 text-sm">Pharmacy: verify the drug licence (Form 20/21), its validity, and the registered pharmacist before approving.</p>}
        <Select label="Decision" value={decision} onChange={(e) => setDecision(e.target.value)}>
          <option value="APPROVED">Approve</option>
          <option value="INFO_REQUIRED">Ask for more information</option>
          <option value="REJECTED">Reject</option>
        </Select>
        <Input label="Commission override % (optional)" inputMode="decimal" value={commission} onChange={(e) => setCommission(e.target.value)} hint="Leave empty to use the platform default for the vertical" />
        <Textarea label="Notes to seller (recorded)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <Button
          block
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api(`/admin/sellers/${seller.id}/verification`, { body: { status: decision, notes: notes || null, commissionRateBps: commission ? Math.round(Number(commission) * 100) : null } });
              toast.show('Decision saved');
              onDone();
            } catch (e) {
              toast.show((e as Error).message, 'error');
            } finally {
              setBusy(false);
            }
          }}
        >
          Save decision
        </Button>
      </div>
    </Modal>
  );
}
