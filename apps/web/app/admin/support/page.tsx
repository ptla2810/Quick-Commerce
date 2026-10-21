'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AdminShell } from '@/components/admin';
import { useToast } from '@/components/providers/toast';
import { api, useApi } from '@/lib/api';
import { money } from '@/components/commerce';
import { Badge, Button, Card, Checkbox, Modal, PageTitle, Select, Spinner, Tabs, Textarea } from '@/components/ui';

interface Ticket { id: string; ticketNumber: string; subject: string; status: string; category: string; updatedAt: string; user: { name: string }; order: { id: string; orderNumber: string } | null; _count: { messages: number } }
interface Ret { id: string; status: string; reason: string; amount: number; createdAt: string; resolutionNote: string | null; user: { name: string }; order: { id: string; orderNumber: string; paymentMethod: string; paymentStatus: string; store: { name: string } } }

function Tickets() {
  const { data, loading, reload } = useApi<{ tickets: Ticket[] }>('/admin/tickets');
  const [open, setOpen] = useState<Ticket | null>(null);
  const thread = useApi<{ ticket: { messages: { id: string; body: string; isStaff: boolean; createdAt: string; author: { name: string } }[] } }>(open ? `/me/support/tickets/${open.id}` : null);
  const [reply, setReply] = useState('');
  return (
    <>
      {loading && <Spinner />}
      <ul className="space-y-2">
        {data?.tickets.map((t) => (
          <li key={t.id}>
            <button className="w-full rounded-2xl bg-white p-4 text-left ring-1 ring-navy-100 hover:ring-brand-500" onClick={() => setOpen(t)}>
              <div className="flex justify-between gap-2">
                <p className="font-semibold">{t.subject}</p>
                <Badge tone={t.status === 'OPEN' ? 'orange' : t.status === 'IN_PROGRESS' ? 'blue' : 'green'}>{t.status.toLowerCase().replace('_', ' ')}</Badge>
              </div>
              <p className="text-xs text-navy-700/80">{t.ticketNumber} · {t.category.toLowerCase().replace(/_/g, ' ')} · {t.user.name}{t.order && ` · ${t.order.orderNumber}`} · {t._count.messages} messages</p>
            </button>
          </li>
        ))}
      </ul>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.subject ?? ''}>
        {open?.order && <Link href={`/admin/orders/${open.order.id}`} className="text-sm text-brand-700 underline">Open order {open.order.orderNumber}</Link>}
        <ul className="mt-2 space-y-2">
          {thread.data?.ticket.messages.map((m) => (
            <li key={m.id} className={`rounded-xl p-3 text-sm ${m.isStaff ? 'bg-brand-50' : 'bg-navy-50'}`}>
              <p className="text-xs font-semibold">{m.author.name} {m.isStaff && '(staff)'} · {new Date(m.createdAt).toLocaleString('en-IN')}</p>
              <p>{m.body}</p>
            </li>
          ))}
        </ul>
        <Textarea label="Reply to customer" value={reply} onChange={(e) => setReply(e.target.value)} />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button onClick={async () => { if (!reply.trim()) return; await api(`/me/support/tickets/${open!.id}/messages`, { body: { body: reply } }); setReply(''); void thread.reload(); void reload(); }}>Send reply</Button>
          <Select label="Set status" value={open?.status ?? 'OPEN'} onChange={async (e) => { await api(`/admin/tickets/${open!.id}/status`, { body: { status: e.target.value } }); setOpen({ ...open!, status: e.target.value }); void reload(); }}>
            {['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((s) => <option key={s} value={s}>{s.toLowerCase().replace('_', ' ')}</option>)}
          </Select>
        </div>
      </Modal>
    </>
  );
}

function Returns() {
  const toast = useToast();
  const { data, loading, reload } = useApi<{ returns: Ret[] }>('/admin/returns');
  const [decide, setDecide] = useState<{ r: Ret; decision: 'APPROVED' | 'REJECTED' } | null>(null);
  const [note, setNote] = useState('');
  const [restock, setRestock] = useState(false);
  return (
    <>
      {loading && <Spinner />}
      <ul className="space-y-2">
        {data?.returns.map((r) => (
          <li key={r.id}>
            <Card className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                <p className="font-semibold">
                  <Link href={`/admin/orders/${r.order.id}`} className="underline">{r.order.orderNumber}</Link> · {r.order.store.name} · {money(r.amount)}
                </p>
                <p className="text-xs text-navy-700/80">{r.user.name}: {r.reason} · paid by {r.order.paymentMethod} ({r.order.paymentStatus.toLowerCase()})</p>
                {r.resolutionNote && <p className="text-xs">Resolution: {r.resolutionNote}</p>}
              </div>
              {r.status === 'REQUESTED' ? (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setDecide({ r, decision: 'APPROVED' })}>Approve refund</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDecide({ r, decision: 'REJECTED' })}>Reject</Button>
                </div>
              ) : (
                <Badge tone={r.status === 'REJECTED' ? 'gray' : 'green'}>{r.status.toLowerCase()}</Badge>
              )}
            </Card>
          </li>
        ))}
      </ul>
      <Modal open={!!decide} onClose={() => setDecide(null)} title={decide?.decision === 'APPROVED' ? 'Approve return' : 'Reject return'}>
        <div className="space-y-3">
          {decide?.decision === 'APPROVED' && <p className="text-sm">{decide.r.order.paymentMethod === 'COD' ? 'Cash orders need a manual refund (UPI/bank transfer); it will be recorded as pending.' : 'Online refunds go back to the original method (instant with the simulated gateway).'}</p>}
          {decide?.decision === 'APPROVED' && <Checkbox label="Return items to store stock" checked={restock} onChange={setRestock} hint="Only if the items are resaleable" />}
          <Textarea label="Note to customer" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button block variant={decide?.decision === 'APPROVED' ? 'primary' : 'danger'} disabled={note.trim().length < 3} onClick={async () => {
            try { await api(`/admin/returns/${decide!.r.id}/decision`, { body: { decision: decide!.decision, note, restock } }); setDecide(null); setNote(''); void reload(); toast.show('Saved'); } catch (e) { toast.show((e as Error).message, 'error'); }
          }}>Confirm</Button>
        </div>
      </Modal>
    </>
  );
}

export default function SupportAdminPage() {
  const [tab, setTab] = useState<'tickets' | 'returns'>('tickets');
  return (
    <AdminShell>
      <PageTitle title="Support, disputes & returns" />
      <Tabs value={tab} onChange={setTab} options={[{ value: 'tickets', label: 'Tickets' }, { value: 'returns', label: 'Returns & refunds' }]} />
      <div className="mt-4">{tab === 'tickets' ? <Tickets /> : <Returns />}</div>
    </AdminShell>
  );
}
