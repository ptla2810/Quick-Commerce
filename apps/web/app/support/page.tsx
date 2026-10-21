'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Mail, Phone } from 'lucide-react';
import { TICKET_CATEGORIES } from '@padosi/shared';
import { AppShell } from '@/components/shells';
import { useAuth } from '@/components/providers/auth';
import { api, useApi } from '@/lib/api';
import { Badge, Button, Card, Input, LinkButton, Modal, Notice, PageTitle, SectionHeader, Select, Textarea } from '@/components/ui';

interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  category: string;
  updatedAt: string;
  order: { orderNumber: string } | null;
}
interface TicketDetail extends Ticket {
  messages: { id: string; body: string; isStaff: boolean; createdAt: string; author: { name: string } }[];
}

function SupportInner() {
  const orderId = useSearchParams().get('orderId');
  const { user } = useAuth();
  const info = useApi<{ contact: { phone: string; email: string; hours: string }; faqs: { q: string; a: string }[] }>('/public/support/info');
  const tickets = useApi<{ tickets: Ticket[] }>(user ? '/me/support/tickets' : null);
  const [form, setForm] = useState({ category: orderId ? 'ORDER_ISSUE' : 'OTHER', subject: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [openTicket, setOpenTicket] = useState<string | null>(null);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <section>
          <SectionHeader title="Frequently asked questions" />
          <div className="space-y-2">
            {info.data?.faqs.map((f) => (
              <details key={f.q} className="rounded-2xl bg-white p-4 ring-1 ring-navy-100/70">
                <summary className="cursor-pointer font-semibold">{f.q}</summary>
                <p className="mt-2 text-sm text-navy-700/90">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
        {user && (
          <section>
            <SectionHeader title="Your tickets" />
            {tickets.data?.tickets.length === 0 && <p className="text-sm text-navy-700/80">No tickets yet.</p>}
            <ul className="space-y-2">
              {tickets.data?.tickets.map((t) => (
                <li key={t.id}>
                  <button onClick={() => setOpenTicket(t.id)} className="w-full rounded-2xl bg-white p-4 text-left ring-1 ring-navy-100/70 hover:ring-brand-500">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">{t.subject}</p>
                      <Badge tone={t.status === 'RESOLVED' || t.status === 'CLOSED' ? 'green' : 'orange'}>{t.status.replace('_', ' ').toLowerCase()}</Badge>
                    </div>
                    <p className="text-xs text-navy-700/70">
                      {t.ticketNumber}
                      {t.order && ` · Order ${t.order.orderNumber}`} · updated {new Date(t.updatedAt).toLocaleDateString('en-IN')}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <aside className="space-y-4">
        <Card className="space-y-2">
          <h2 className="font-semibold">Contact us</h2>
          {info.data && (
            <>
              <a href={`tel:${info.data.contact.phone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-2 text-sm font-semibold text-brand-700">
                <Phone className="h-4 w-4" aria-hidden /> {info.data.contact.phone}
              </a>
              <a href={`mailto:${info.data.contact.email}`} className="flex items-center gap-2 text-sm font-semibold text-brand-700">
                <Mail className="h-4 w-4" aria-hidden /> {info.data.contact.email}
              </a>
              <p className="text-xs text-navy-700/70">{info.data.contact.hours}</p>
            </>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Raise a request</h2>
          {!user ? (
            <LinkButton href="/login?next=/support" block>
              Sign in to raise a request
            </LinkButton>
          ) : (
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setErr(null);
                try {
                  const r = await api<{ ticket: { ticketNumber: string } }>('/me/support/tickets', { body: { ...form, orderId } });
                  setDone(r.ticket.ticketNumber);
                  setForm({ ...form, subject: '', message: '' });
                  void tickets.reload();
                } catch (e) {
                  setErr((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {orderId && <Notice>This request will be linked to your order.</Notice>}
              <Select label="Topic" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {TICKET_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.replace(/_/g, ' ').toLowerCase()}
                  </option>
                ))}
              </Select>
              <Input label="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required maxLength={120} />
              <Textarea label="Tell us what happened" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required maxLength={2000} />
              {err && <Notice tone="red">{err}</Notice>}
              {done && <Notice tone="green">Request {done} created. We will reply here.</Notice>}
              <Button type="submit" block loading={busy}>
                Submit
              </Button>
            </form>
          )}
        </Card>
      </aside>
      <TicketModal id={openTicket} onClose={() => setOpenTicket(null)} />
    </div>
  );
}

function TicketModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useApi<{ ticket: TicketDetail }>(id ? `/me/support/tickets/${id}` : null);
  const [reply, setReply] = useState('');
  return (
    <Modal open={!!id} onClose={onClose} title={t.data?.ticket.subject ?? 'Ticket'}>
      <ul className="space-y-2">
        {t.data?.ticket.messages.map((m) => (
          <li key={m.id} className={`rounded-xl p-3 text-sm ${m.isStaff ? 'bg-brand-50' : 'bg-navy-50'}`}>
            <p className="text-xs font-semibold">{m.isStaff ? 'Support team' : 'You'} · {new Date(m.createdAt).toLocaleString('en-IN')}</p>
            <p className="mt-1">{m.body}</p>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!reply.trim()) return;
          await api(`/me/support/tickets/${id}/messages`, { body: { body: reply } });
          setReply('');
          void t.reload();
        }}
      >
        <Textarea label="Reply" value={reply} onChange={(e) => setReply(e.target.value)} />
        <Button type="submit">Send</Button>
      </form>
    </Modal>
  );
}

export default function SupportPage() {
  return (
    <AppShell>
      <PageTitle title="Help & support" />
      <Suspense>
        <SupportInner />
      </Suspense>
    </AppShell>
  );
}
