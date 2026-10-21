'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { AppShell, RequireAuth } from '@/components/shells';
import { api, useApi } from '@/lib/api';
import { Card, EmptyState, ErrorState, PageTitle, Spinner } from '@/components/ui';

interface N {
  id: string;
  title: string;
  body: string;
  type: string;
  readAt: string | null;
  createdAt: string;
  data: { orderId?: string; rfqId?: string } | null;
}

function NotificationsInner() {
  const { data, error, loading, reload } = useApi<{ notifications: N[]; unread: number }>('/me/notifications');
  useEffect(() => {
    if (data?.unread) void api('/me/notifications/read', { body: {} });
  }, [data?.unread]);
  if (loading) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data?.notifications.length) return <EmptyState icon="🔔" title="No notifications yet" />;
  return (
    <ul className="space-y-2">
      {data.notifications.map((n) => {
        const href = n.data?.orderId ? `/orders/${n.data.orderId}` : n.data?.rfqId ? `/business/rfq/${n.data.rfqId}` : null;
        const body = (
          <Card className={n.readAt ? '' : 'ring-2 ring-brand-500'}>
            <p className="font-semibold">{n.title}</p>
            <p className="text-sm text-navy-700/80">{n.body}</p>
            <p className="mt-1 text-xs text-navy-700/60">{new Date(n.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
          </Card>
        );
        return <li key={n.id}>{href ? <Link href={href}>{body}</Link> : body}</li>;
      })}
    </ul>
  );
}

export default function NotificationsPage() {
  return (
    <AppShell>
      <PageTitle title="Notifications" subtitle="Order updates appear here. SMS and push delivery are simulated in this demo." />
      <RequireAuth>
        <NotificationsInner />
      </RequireAuth>
    </AppShell>
  );
}
