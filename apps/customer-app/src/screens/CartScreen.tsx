import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useNav } from '../nav';
import { useCart } from '../cart';
import { money } from '../format';
import { Badge, Button, Card, Empty, Notice, Screen, s } from '../ui';

export function CartScreen() {
  const nav = useNav();
  const { cart, setItem, refresh } = useCart();
  useEffect(() => {
    void refresh();
  }, [refresh]);
  if (!cart || cart.items.length === 0)
    return (
      <Screen title="Cart">
        <Empty title="Your cart is empty" body="Add items from a store near you." action={<Button title="Start shopping" onPress={() => nav.reset('home')} />} />
      </Screen>
    );
  const below = cart.estimatedSubtotal < cart.store.minOrderValue;
  return (
    <Screen title="Cart">
      <Text style={[s.muted, { marginBottom: 8 }]}>From {cart.store.name}</Text>
      {cart.items.map((i) => (
        <Card key={i.id}>
          <View style={s.between}>
            <View style={{ flex: 1 }}>
              <Text style={[s.body, { fontWeight: '700' }]}>{i.productName}</Text>
              <Text style={s.muted}>
                {i.variantName} · {money(i.unitPrice)} each
              </Text>
              {i.requiresPrescription && <Badge text="Prescription required" tone="orange" />}
              {i.stockStatus !== 'OK' && <Text style={{ color: '#B42318', fontWeight: '700' }}>{i.stockStatus === 'INSUFFICIENT' ? `Only ${i.maxQuantity} available` : 'Unavailable'}</Text>}
            </View>
            <Text style={[s.body, { fontWeight: '800' }]}>{money(i.lineTotal)}</Text>
          </View>
          <View style={[s.row, { gap: 8, marginTop: 8 }]}>
            <Button title="−" variant="secondary" onPress={() => setItem(cart.store.id, i.variantId, i.quantity <= i.minOrderQty ? 0 : i.quantity - 1)} />
            <Text style={[s.body, { fontWeight: '800' }]}>{i.quantity}</Text>
            <Button title="+" variant="secondary" onPress={() => setItem(cart.store.id, i.variantId, i.quantity + 1)} />
            <Button title="Remove" variant="ghost" onPress={() => setItem(cart.store.id, i.variantId, 0)} />
          </View>
        </Card>
      ))}
      {below && <Notice tone="orange" text={`Add ${money(cart.store.minOrderValue - cart.estimatedSubtotal)} more to reach the store minimum.`} />}
      {cart.requiresPrescription && <Notice tone="orange" text="Prescription medicines need a prescription uploaded from the website for now; mobile upload is coming next." />}
      <Text style={[s.h2, { marginVertical: 8 }]}>Items: {money(cart.estimatedSubtotal)}</Text>
      <Button title="Proceed to checkout" onPress={() => nav.push('checkout')} disabled={below} />
    </Screen>
  );
}
