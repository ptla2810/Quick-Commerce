import { useState } from 'react';
import { Text } from 'react-native';
import { api } from '../api';
import { useNav } from '../nav';
import { useApi } from '../useApi';
import { money } from '../format';
import { Button, Card, Loading, Notice, Screen, s } from '../ui';

/** Simulated gateway for development (PAYMENT_PROVIDER=mock). A real build opens the Razorpay SDK here. */
export function PayScreen() {
  const nav = useNav();
  const id = nav.route.params!.paymentId;
  const { data } = useApi<{ payment: { amount: number; method: string; status: string; orderId: string; orderNumber: string } }>(`/payments/${id}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const complete = async (outcome: 'success' | 'failure') => {
    setBusy(outcome);
    try {
      await api(`/payments/${id}/mock-complete`, { body: { outcome } });
      nav.replace('order', { id: data!.payment.orderId, placed: outcome === 'success' ? '1' : '' });
    } catch (e) {
      setErr((e as Error).message);
      setBusy(null);
    }
  };
  return (
    <Screen title="Payment">
      {!data ? (
        <Loading />
      ) : (
        <Card>
          <Notice tone="orange" text="Simulated payment. No money moves and no card or UPI details are collected." />
          <Text style={s.muted}>Order {data.payment.orderNumber}</Text>
          <Text style={[s.h1, { marginVertical: 8 }]}>{money(data.payment.amount)}</Text>
          {err && <Notice tone="red" text={err} />}
          <Button title="Simulate successful payment" loading={busy === 'success'} onPress={() => complete('success')} style={{ marginBottom: 8 }} />
          <Button title="Simulate failed payment" variant="secondary" loading={busy === 'failure'} onPress={() => complete('failure')} />
        </Card>
      )}
    </Screen>
  );
}
