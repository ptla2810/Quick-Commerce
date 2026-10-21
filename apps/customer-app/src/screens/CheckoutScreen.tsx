import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api, ApiError, newKey } from '../api';
import { useNav } from '../nav';
import { useCart } from '../cart';
import { useSession } from '../session';
import { useApi } from '../useApi';
import { money } from '../format';
import { Button, C, Card, Field, Loading, Notice, Screen, s } from '../ui';

interface Address {
  id: string;
  label: string;
  line1: string;
  serviceable: boolean;
  locality: { id: string; name: string };
}
interface Quote {
  canPlaceOrder: boolean;
  issues: { code: string; message: string }[];
  paymentMethods: { method: string; available: boolean; reason?: string }[];
  delivery: { etaMinMins: number; etaMaxMins: number } | null;
  totals: { itemsSubtotal: number; discount: number; deliveryFee: number; taxTotal: number; grandTotal: number } | null;
}
const METHODS: Record<string, string> = { COD: 'Cash on delivery', UPI: 'UPI', CARD: 'Card', NETBANKING: 'Net banking' };

function Choice({ selected, onPress, title, sub, disabled }: { selected: boolean; onPress: () => void; title: string; sub?: string; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress} style={{ padding: 12, borderRadius: 12, borderWidth: selected ? 2 : 1, borderColor: selected ? C.green : C.line, backgroundColor: selected ? C.greenSoft : '#fff', marginBottom: 8, opacity: disabled ? 0.5 : 1 }}>
      <Text style={[s.body, { fontWeight: '700' }]}>{title}</Text>
      {sub ? <Text style={s.muted}>{sub}</Text> : null}
    </Pressable>
  );
}

export function CheckoutScreen() {
  const nav = useNav();
  const { refresh } = useCart();
  const { location, user } = useSession();
  const addresses = useApi<{ addresses: Address[] }>('/me/addresses');
  const [addressId, setAddressId] = useState<string | null>(null);
  const [payment, setPayment] = useState('COD');
  const [coupon, setCoupon] = useState('');
  const [applied, setApplied] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [placing, setPlacing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [line1, setLine1] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const idem = useRef(newKey());

  useEffect(() => {
    if (!addressId && addresses.data?.addresses.length) setAddressId((addresses.data.addresses.find((a) => a.serviceable) ?? addresses.data.addresses[0]).id);
  }, [addresses.data, addressId]);

  const body = useCallback(() => ({ addressId: addressId ?? undefined, paymentMethod: payment, couponCode: applied, fulfilmentType: 'DELIVERY' }), [addressId, payment, applied]);
  useEffect(() => {
    api<Quote>('/checkout/quote', { body: body() }).then(setQuote).catch((e) => setErr((e as Error).message));
  }, [body]);

  const addAddress = async () => {
    if (!location) return;
    try {
      const r = await api<{ address: { id: string } }>('/me/addresses', {
        body: { label: 'Home', contactName: user?.name ?? 'Customer', contactPhone, line1, localityId: location.localityId, postalCode: location.postalCode, lat: location.lat, lng: location.lng },
      });
      setAdding(false);
      await addresses.reload();
      setAddressId(r.address.id);
    } catch (e) {
      setErr((e as ApiError).details?.fields ? Object.values((e as ApiError).details!.fields!)[0] : (e as Error).message);
    }
  };

  const place = async () => {
    setPlacing(true);
    setErr(null);
    try {
      const r = await api<{ order: { id: string; status: string } }>('/orders', { body: { ...body(), idempotencyKey: idem.current } });
      await refresh();
      if (r.order.status === 'PENDING_PAYMENT') {
        const p = await api<{ paymentId: string }>(`/orders/${r.order.id}/pay`, { body: { method: payment }, headers: { 'Idempotency-Key': `${idem.current}-pay` } });
        nav.replace('pay', { paymentId: p.paymentId, orderId: r.order.id });
      } else nav.replace('order', { id: r.order.id, placed: '1' });
    } catch (e) {
      setErr((e as ApiError).details?.issues?.map((i) => i.message).join(' · ') ?? (e as Error).message);
      idem.current = newKey();
    } finally {
      setPlacing(false);
    }
  };

  const blocking = quote?.issues.filter((i) => i.code !== 'COUPON_INVALID') ?? [];
  return (
    <Screen title="Checkout">
      <Text style={[s.h2, { marginBottom: 8 }]}>Delivery address</Text>
      {addresses.loading && <Loading />}
      {addresses.data?.addresses.map((a) => (
        <Choice key={a.id} selected={addressId === a.id} onPress={() => setAddressId(a.id)} title={a.label} sub={`${a.line1}, ${a.locality.name}${a.serviceable ? '' : ' · not serviceable'}`} />
      ))}
      {adding ? (
        <Card>
          <Text style={s.muted}>New address in {location?.localityName}</Text>
          <Field label="House / street" value={line1} onChangeText={setLine1} />
          <Field label="Contact mobile" keyboardType="phone-pad" value={contactPhone} onChangeText={setContactPhone} />
          <Button title="Save address" onPress={addAddress} />
        </Card>
      ) : (
        <Button title="Add new address" variant="secondary" onPress={() => setAdding(true)} style={{ marginBottom: 16 }} />
      )}
      <Text style={[s.h2, { marginBottom: 8 }]}>Payment</Text>
      {(quote?.paymentMethods ?? []).filter((p) => METHODS[p.method]).map((p) => (
        <Choice key={p.method} selected={payment === p.method} disabled={!p.available} onPress={() => setPayment(p.method)} title={METHODS[p.method]} sub={p.reason} />
      ))}
      <View style={[s.row, { gap: 8, alignItems: 'flex-end' }]}>
        <View style={{ flex: 1 }}>
          <Field label="Coupon code" autoCapitalize="characters" value={coupon} onChangeText={setCoupon} error={quote?.issues.find((i) => i.code === 'COUPON_INVALID')?.message} />
        </View>
        <Button title="Apply" variant="secondary" onPress={() => setApplied(coupon.trim().toUpperCase() || null)} style={{ marginBottom: 12 }} />
      </View>
      <Card>
        {quote?.totals ? (
          <>
            <View style={s.between}><Text style={s.body}>Items</Text><Text style={s.body}>{money(quote.totals.itemsSubtotal)}</Text></View>
            {quote.totals.discount > 0 && <View style={s.between}><Text style={[s.body, { color: C.green }]}>Discount</Text><Text style={[s.body, { color: C.green }]}>− {money(quote.totals.discount)}</Text></View>}
            <View style={s.between}><Text style={s.body}>Delivery</Text><Text style={s.body}>{quote.totals.deliveryFee ? money(quote.totals.deliveryFee) : 'Free'}</Text></View>
            <View style={[s.between, { marginTop: 6 }]}><Text style={s.h2}>Total</Text><Text style={s.h2}>{money(quote.totals.grandTotal)}</Text></View>
            <Text style={s.muted}>Includes GST {money(quote.totals.taxTotal)}{quote.delivery ? ` · est. ${quote.delivery.etaMinMins}–${quote.delivery.etaMaxMins} min` : ''}</Text>
          </>
        ) : (
          <Loading />
        )}
      </Card>
      {blocking.map((i, k) => <Notice key={k} tone="red" text={i.message} />)}
      {err && <Notice tone="red" text={err} />}
      <Button title={payment === 'COD' ? 'Place order' : 'Place order & pay'} loading={placing} disabled={!quote?.canPlaceOrder} onPress={place} />
    </Screen>
  );
}
