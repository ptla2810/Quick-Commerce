import { useEffect, useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { api, newKey } from '../api';
import { useNav } from '../nav';
import { useApi } from '../useApi';
import { label, money, PROGRESS } from '../format';
import { Badge, Button, C, Card, Loading, Notice, Screen, s } from '../ui';

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  fulfilmentType: string;
  etaMinMins: number | null;
  etaMaxMins: number | null;
  deliveryOtp?: string | null;
  totals: { grandTotal: number; deliveryFee: number; discount: number; taxTotal: number };
  items: { id: string; productName: string; variantName: string; quantity: number; netAmount: number }[];
  events: { toStatus: string; at: string }[];
  store: { name: string; phone: string };
  delivery: { partnerName: string; status: string } | null;
  actions: { canCancel: boolean; canPay: boolean };
}

export function OrderScreen() {
  const nav = useNav();
  const id = nav.route.params!.id;
  const { data, loading, reload } = useApi<{ order: Order }>(`/orders/${id}`);
  const [busy, setBusy] = useState(false);
  const o = data?.order;
  const active = o && !['DELIVERED', 'CANCELLED', 'REJECTED'].includes(o.status);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => void reload(), 15_000);
    return () => clearInterval(t);
  }, [active, reload]);
  if (loading && !o) return <Screen title="Order"><Loading /></Screen>;
  if (!o) return <Screen title="Order"><Notice tone="red" text="Order not found" /></Screen>;
  const step = PROGRESS.indexOf(o.status);
  return (
    <Screen title={`Order ${o.orderNumber}`}>
      {nav.route.params?.placed === '1' && <Notice tone="green" text={o.status === 'AWAITING_RX_REVIEW' ? 'Order placed. A pharmacist will review your prescription.' : `Order placed! ${o.store.name} will confirm shortly.`} />}
      <Card>
        <View style={s.between}>
          <Text style={s.h2}>{o.store.name}</Text>
          <Badge text={label(o.status)} tone={o.status === 'DELIVERED' ? 'green' : ['CANCELLED', 'REJECTED', 'DELIVERY_FAILED'].includes(o.status) ? 'red' : 'navy'} />
        </View>
        {o.etaMinMins != null && active && <Text style={s.muted}>Estimated {o.etaMinMins}–{o.etaMaxMins} min after the store accepts (estimate, not a guarantee)</Text>}
        {o.paymentStatus === 'FAILED' && <Notice tone="red" text="Payment failed. No money was taken." />}
      </Card>
      {o.deliveryOtp && (
        <Card style={{ backgroundColor: C.orangeSoft }}>
          <Text style={s.body}>Delivery code — share only when you receive your order</Text>
          <Text style={{ fontSize: 34, fontWeight: '800', letterSpacing: 8, color: C.navyText }} accessibilityLabel={`Delivery code ${o.deliveryOtp.split('').join(' ')}`}>
            {o.deliveryOtp}
          </Text>
        </Card>
      )}
      <Card>
        {step >= 0 ? (
          PROGRESS.filter((p) => !(o.fulfilmentType === 'PICKUP' && p === 'OUT_FOR_DELIVERY')).map((p, i) => (
            <View key={p} style={[s.row, { marginBottom: 6 }]} accessibilityLabel={`${label(p)}${i <= step ? ', done' : ''}`}>
              <View style={{ width: 14, height: 14, borderRadius: 7, marginRight: 10, backgroundColor: PROGRESS.indexOf(p) <= step ? C.green : C.line }} />
              <Text style={[s.body, { color: PROGRESS.indexOf(p) <= step ? C.navyText : C.muted }]}>{label(p)}</Text>
            </View>
          ))
        ) : (
          o.events.map((e, i) => <Text key={i} style={s.body}>• {label(e.toStatus)} — {new Date(e.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</Text>)
        )}
        {o.delivery && <Text style={[s.muted, { marginTop: 6 }]}>Delivery partner: {o.delivery.partnerName}</Text>}
      </Card>
      <Card>
        {o.items.map((i) => (
          <View key={i.id} style={s.between}>
            <Text style={[s.body, { flex: 1 }]}>{i.productName} ({i.variantName}) × {i.quantity}</Text>
            <Text style={s.body}>{money(i.netAmount)}</Text>
          </View>
        ))}
        <View style={[s.between, { marginTop: 8 }]}>
          <Text style={s.h2}>Total</Text>
          <Text style={s.h2}>{money(o.totals.grandTotal)}</Text>
        </View>
        <Text style={s.muted}>{o.paymentMethod} · {o.paymentStatus.replace('_', ' ').toLowerCase()} · GST {money(o.totals.taxTotal)}</Text>
      </Card>
      {o.actions.canPay && (
        <Button title="Complete payment" loading={busy} onPress={async () => {
          setBusy(true);
          try {
            const p = await api<{ paymentId: string }>(`/orders/${o.id}/pay`, { body: { method: o.paymentMethod === 'COD' ? 'UPI' : o.paymentMethod }, headers: { 'Idempotency-Key': newKey() } });
            nav.push('pay', { paymentId: p.paymentId });
          } finally {
            setBusy(false);
          }
        }} style={{ marginBottom: 8 }} />
      )}
      <Button title="Call store" variant="secondary" onPress={() => Linking.openURL(`tel:${o.store.phone}`)} style={{ marginBottom: 8 }} />
      {o.actions.canCancel && (
        <Button title="Cancel order" variant="ghost" onPress={() => Alert.alert('Cancel this order?', 'Any online payment will be refunded.', [
          { text: 'Keep order', style: 'cancel' },
          { text: 'Cancel order', style: 'destructive', onPress: async () => { try { await api(`/orders/${o.id}/cancel`, { body: { reason: 'Cancelled from mobile app' } }); await reload(); } catch (e) { Alert.alert('Could not cancel', (e as Error).message); } } },
        ])} />
      )}
    </Screen>
  );
}
