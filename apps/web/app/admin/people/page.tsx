'use client';

import { useState } from 'react';
import { AdminShell } from '@/components/admin';
import { useToast } from '@/components/providers/toast';
import { api, useApi } from '@/lib/api';
import { money } from '@/components/commerce';
import { Badge, Button, Card, Checkbox, Input, Modal, PageTitle, Select, Spinner, Tabs, Textarea, VerificationBadge } from '@/components/ui';

interface User { id: string; name: string; phone: string | null; email: string | null; status: string; isDemo: boolean; createdAt: string; roles: { role: string }[]; _count: { orders: number } }
interface Biz { id: string; businessName: string; legalName: string; businessType: string; gstin: string | null; fssaiNumber: string | null; verificationStatus: string; creditApproved: boolean; creditLimit: number; creditDays: number; creditUsed: number; user: { name: string; phone: string | null }; city: { name: string }; documents: { id: string; type: string; fileId: string }[] }
interface Rider { id: string; vehicleType: string; vehicleNumber: string | null; drivingLicenceNumber: string | null; verificationStatus: string; isOnline: boolean; user: { name: string; phone: string | null }; city: { name: string }; _count: { assignments: number } }

function Users() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const { data, loading, reload } = useApi<{ users: User[] }>(`/admin/users${query ? `?q=${encodeURIComponent(query)}` : ''}`);
  return (
    <>
      <form className="mb-3 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); setQuery(q); }}>
        <Input label="Search name, phone or email" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      {loading && <Spinner />}
      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-navy-100">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="bg-navy-50 text-left text-xs uppercase"><tr><th className="p-3">Name</th><th className="p-3">Contact</th><th className="p-3">Roles</th><th className="p-3">Orders</th><th className="p-3">Status</th><th className="p-3" /></tr></thead>
          <tbody className="divide-y divide-navy-100">
            {data?.users.map((u) => (
              <tr key={u.id}>
                <td className="p-3 font-semibold">{u.name} {u.isDemo && <Badge tone="orange">demo</Badge>}</td>
                <td className="p-3 text-xs">{u.phone}<br />{u.email}</td>
                <td className="p-3 text-xs">{u.roles.map((r) => r.role.toLowerCase().replace('_', ' ')).join(', ')}</td>
                <td className="p-3">{u._count.orders}</td>
                <td className="p-3"><Badge tone={u.status === 'ACTIVE' ? 'green' : 'red'}>{u.status.toLowerCase()}</Badge></td>
                <td className="p-3">
                  <Button size="sm" variant="ghost" onClick={async () => {
                    const status = u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
                    if (status === 'SUSPENDED' && !window.confirm(`Suspend ${u.name}? They will be signed out everywhere.`)) return;
                    try { await api(`/admin/users/${u.id}/status`, { body: { status } }); void reload(); } catch (e) { toast.show((e as Error).message, 'error'); }
                  }}>{u.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Businesses() {
  const toast = useToast();
  const { data, loading, reload } = useApi<{ profiles: Biz[] }>('/admin/business-profiles');
  const [edit, setEdit] = useState<Biz | null>(null);
  const [f, setF] = useState({ status: 'APPROVED', notes: '', credit: false, limit: '0', days: '15' });
  return (
    <>
      {loading && <Spinner />}
      <div className="grid gap-3 md:grid-cols-2">
        {data?.profiles.map((b) => (
          <Card key={b.id}>
            <div className="flex justify-between gap-2">
              <p className="font-semibold">{b.businessName}</p>
              <VerificationBadge status={b.verificationStatus} />
            </div>
            <p className="text-xs text-navy-700/80">{b.legalName} · {b.businessType.toLowerCase()} · {b.city.name} · GSTIN {b.gstin ?? '—'} · FSSAI {b.fssaiNumber ?? '—'}</p>
            <p className="text-xs text-navy-700/80">Owner {b.user.name} ({b.user.phone})</p>
            <p className="mt-1 text-sm">Credit: {b.creditApproved ? `${money(b.creditUsed)} used of ${money(b.creditLimit)}, ${b.creditDays} days` : 'not approved'}</p>
            {b.documents.map((d) => <a key={d.id} href={`/api/me/files/${d.fileId}`} target="_blank" rel="noopener" className="mr-2 text-sm text-brand-700 underline">{d.type.toLowerCase().replace(/_/g, ' ')}</a>)}
            <Button size="sm" className="mt-2" onClick={() => { setEdit(b); setF({ status: b.verificationStatus === 'PENDING' ? 'APPROVED' : b.verificationStatus, notes: '', credit: b.creditApproved, limit: String(b.creditLimit / 100), days: String(b.creditDays || 15) }); }}>Review</Button>
          </Card>
        ))}
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Review ${edit?.businessName ?? ''}`}>
        <div className="space-y-3">
          <Select label="Verification" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="APPROVED">Approve</option><option value="INFO_REQUIRED">Need more info</option><option value="REJECTED">Reject</option>
          </Select>
          <Checkbox label="Approve credit terms" checked={f.credit} onChange={(v) => setF({ ...f, credit: v })} hint="Only for verified businesses; collections are handled offline in this MVP." />
          {f.credit && (
            <div className="grid grid-cols-2 gap-2">
              <Input label="Credit limit ₹" inputMode="numeric" value={f.limit} onChange={(e) => setF({ ...f, limit: e.target.value })} />
              <Input label="Credit days" inputMode="numeric" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} />
            </div>
          )}
          <Textarea label="Notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          <Button block onClick={async () => {
            try {
              await api(`/admin/business-profiles/${edit!.id}/verification`, { body: { status: f.status, notes: f.notes || null, creditApproved: f.status === 'APPROVED' && f.credit, creditLimit: Math.round(Number(f.limit) * 100), creditDays: Number(f.days) } });
              setEdit(null); void reload(); toast.show('Saved');
            } catch (e) { toast.show((e as Error).message, 'error'); }
          }}>Save</Button>
        </div>
      </Modal>
    </>
  );
}

function Riders() {
  const toast = useToast();
  const { data, loading, reload } = useApi<{ partners: Rider[] }>('/admin/delivery-partners');
  return (
    <>
      {loading && <Spinner />}
      <div className="grid gap-3 md:grid-cols-2">
        {data?.partners.map((p) => (
          <Card key={p.id}>
            <div className="flex justify-between"><p className="font-semibold">{p.user.name}</p><VerificationBadge status={p.verificationStatus} /></div>
            <p className="text-xs text-navy-700/80">{p.user.phone} · {p.city.name} · {p.vehicleType.toLowerCase()} {p.vehicleNumber} · DL {p.drivingLicenceNumber ?? '—'}</p>
            <p className="text-sm">{p.isOnline ? <Badge tone="green">online</Badge> : <Badge tone="gray">offline</Badge>} · {p._count.assignments} deliveries</p>
            <div className="mt-2 flex gap-2">
              {['APPROVED', 'REJECTED'].filter((s) => s !== p.verificationStatus).map((s) => (
                <Button key={s} size="sm" variant={s === 'APPROVED' ? 'primary' : 'ghost'} onClick={async () => {
                  try { await api(`/admin/delivery-partners/${p.id}/verification`, { body: { status: s, notes: null } }); void reload(); } catch (e) { toast.show((e as Error).message, 'error'); }
                }}>{s === 'APPROVED' ? 'Approve' : 'Reject'}</Button>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

export default function PeoplePage() {
  const [tab, setTab] = useState<'users' | 'business' | 'riders'>('users');
  return (
    <AdminShell>
      <PageTitle title="Customers, business buyers & delivery partners" />
      <Tabs value={tab} onChange={setTab} options={[{ value: 'users', label: 'All users' }, { value: 'business', label: 'Business buyers' }, { value: 'riders', label: 'Delivery partners' }]} />
      <div className="mt-4">{tab === 'users' ? <Users /> : tab === 'business' ? <Businesses /> : <Riders />}</div>
    </AdminShell>
  );
}
