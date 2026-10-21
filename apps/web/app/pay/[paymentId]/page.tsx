'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { AppShell, RequireAuth } from '@/components/shells';
import { api, useApi } from '@/lib/api';
import { money } from '@/components/commerce';
import { Button, Card, ErrorState, Notice, Spinner } from '@/components/ui';

/** Simulated payment gateway page, used only with PAYMENT_PROVIDER=mock in development. */
export default function MockPayPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = use(params);
  const router = useRouter();
  const { data, error, loading } = useApi<{ payment: { id: string; amount: number; method: string; status: string; orderId: string; orderNumber: string } }>(`/payments/${paymentId}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const complete = async (outcome: 'success' | 'failure') => {
    setBusy(outcome);
    setErr(null);
    try {
      await api(`/payments/${paymentId}/mock-complete`, { body: { outcome } });
      router.push(`/orders/${data!.payment.orderId}?payment=${outcome}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(null);
    }
  };

  return (
    <AppShell hideSearch>
      <RequireAuth>
        <div className="mx-auto max-w-md">
          {loading && <Spinner />}
          {error && <ErrorState error={error} />}
          {data && (
            <Card className="space-y-4 text-center">
              <ShieldAlert className="mx-auto h-10 w-10 text-accent-700" aria-hidden />
              <h1 className="text-xl font-bold">Simulated payment</h1>
              <Notice tone="orange">This is a development payment simulator. No money moves and no card or UPI details are collected.</Notice>
              <p className="text-sm text-navy-700/80">Order {data.payment.orderNumber}</p>
              <p className="text-3xl font-bold">{money(data.payment.amount)}</p>
              <p className="text-sm">Method: {data.payment.method}</p>
              {data.payment.status !== 'CREATED' ? (
                <Notice>This payment is already {data.payment.status.toLowerCase()}.</Notice>
              ) : (
                <div className="grid gap-2">
                  <Button size="lg" loading={busy === 'success'} disabled={!!busy} onClick={() => complete('success')}>
                    Simulate successful payment
                  </Button>
                  <Button size="lg" variant="secondary" loading={busy === 'failure'} disabled={!!busy} onClick={() => complete('failure')}>
                    Simulate failed payment
                  </Button>
                </div>
              )}
              {err && <Notice tone="red">{err}</Notice>}
            </Card>
          )}
        </div>
      </RequireAuth>
    </AppShell>
  );
}
