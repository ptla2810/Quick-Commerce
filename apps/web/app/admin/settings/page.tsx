'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin';
import { useToast } from '@/components/providers/toast';
import { api, ApiError, useApi } from '@/lib/api';
import { Button, Card, Notice, PageTitle, Spinner, Textarea } from '@/components/ui';

/** Super-admin JSON editor for platform settings. Values are validated by the API. */
export default function SettingsPage() {
  const toast = useToast();
  const { data, loading, reload } = useApi<{ settings: Record<string, unknown> }>('/admin/settings');
  const status = useApi<{ providers: Record<string, string | boolean>; environment: string; demoMode: boolean }>('/dev/status');
  const [text, setText] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (data) setText(Object.fromEntries(Object.entries(data.settings).map(([k, v]) => [k, JSON.stringify(v, null, 2)])));
  }, [data]);
  const HELP: Record<string, string> = {
    delivery: 'Delivery estimate model (speed km/h, buffer, road factor) and distance fee (paise per km beyond free km).',
    commissionBps: 'Default commission per vertical in basis points (800 = 8%).',
    customerCancellableStatuses: 'Statuses in which customers may cancel themselves.',
    deliveryPartnerPayout: 'Rider payout per delivery (paise) + per km.',
    codMaxOrderValue: 'Maximum order value for cash on delivery (paise).',
    pendingPaymentTimeoutMins: 'Unpaid online orders are cancelled after this many minutes.',
    returnWindowHours: 'Hours after delivery during which customers can request returns.',
    support: 'Support contact details shown to customers.',
  };
  return (
    <AdminShell>
      <PageTitle title="Platform settings" subtitle="Changes apply within 30 seconds and are recorded in the audit log." />
      {status.data && (
        <Card className="mb-4 text-sm">
          <p className="font-semibold">Integrations</p>
          <p>Environment: {status.data.environment} · demo mode {status.data.demoMode ? 'ON' : 'off'}</p>
          <p>Payments: {String(status.data.providers.payment)}{status.data.providers.paymentSimulated ? ' (simulated)' : ''} · SMS: {String(status.data.providers.sms)} · Maps: {String(status.data.providers.maps)} (straight-line distance) · Storage: {String(status.data.providers.storage)}</p>
          <p className="text-xs text-navy-700/70">Provider credentials are configured through server environment variables, never in this screen.</p>
        </Card>
      )}
      {loading && <Spinner />}
      <div className="grid gap-4 lg:grid-cols-2">
        {Object.keys(text).map((k) => (
          <Card key={k} className="space-y-2">
            <Textarea label={k} hint={HELP[k]} rows={Math.min(10, text[k].split('\n').length + 1)} value={text[k]} onChange={(e) => setText({ ...text, [k]: e.target.value })} error={errors[k]} className="font-mono" />
            <Button size="sm" onClick={async () => {
              setErrors({});
              let value: unknown;
              try { value = JSON.parse(text[k]); } catch { return setErrors({ [k]: 'Not valid JSON' }); }
              try { await api('/admin/settings', { method: 'PUT', body: { [k]: value } }); toast.show(`${k} saved`); void reload(); }
              catch (e) { setErrors({ [k]: Object.values((e as ApiError).details?.fields ?? {})[0] ?? (e as Error).message }); }
            }}>Save {k}</Button>
          </Card>
        ))}
      </div>
      <div className="mt-4"><Notice>Money values are in paise (₹1 = 100).</Notice></div>
    </AdminShell>
  );
}
