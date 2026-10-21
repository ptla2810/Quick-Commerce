import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useCart } from '../cart';
import { money } from '../format';
import { Badge, Button, C, Card, s } from '../ui';

export interface Product {
  id: string;
  name: string;
  requiresPrescription: boolean;
  isDemo: boolean;
  category: { icon: string | null };
  variants: { id: string; name: string; mrp: number; bestOffer: { storeId: string; storeName: string; price: number; inStock: boolean; isOpen: boolean; minOrderQty: number; etaMinMins: number; etaMaxMins: number; lowStock: boolean; stockLeft: number | null } | null }[];
}

export function ProductRow({ p }: { p: Product }) {
  const { setItem, qtyOf, busy } = useCart();
  const v = p.variants[0];
  const o = v?.bestOffer;
  if (!v || !o) return null;
  const qty = qtyOf(v.id);
  return (
    <Card>
      <View style={s.row}>
        <View style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: '#E8F6EE', alignItems: 'center', justifyContent: 'center', marginRight: 12 }} accessibilityLabel="Illustrative product image">
          <Text style={{ fontSize: 26 }}>{p.category.icon ?? '🛒'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.body, { fontWeight: '700' }]}>{p.name}</Text>
          <Text style={s.muted}>
            {v.name} · {o.storeName} · {o.etaMinMins}–{o.etaMaxMins} min
          </Text>
          <View style={[s.row, { gap: 6, marginTop: 4 }]}>
            <Text style={[s.body, { fontWeight: '800' }]}>{money(o.price)}</Text>
            {v.mrp > o.price && <Text style={[s.muted, { textDecorationLine: 'line-through' }]}>{money(v.mrp)}</Text>}
            {p.requiresPrescription && <Badge text="Rx" tone="orange" />}
            {o.lowStock && <Badge text={`Only ${o.stockLeft} left`} tone="red" />}
          </View>
        </View>
        {!o.inStock ? (
          <Text style={{ color: C.red, fontWeight: '700' }}>Out of stock</Text>
        ) : !o.isOpen ? (
          <Text style={s.muted}>Closed</Text>
        ) : busy === v.id ? (
          <ActivityIndicator color={C.green} />
        ) : qty === 0 ? (
          <Button title="Add" variant="secondary" onPress={() => setItem(o.storeId, v.id, o.minOrderQty)} />
        ) : (
          <View style={[s.row, { backgroundColor: C.green, borderRadius: 12 }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${p.name}`} onPress={() => setItem(o.storeId, v.id, qty <= o.minOrderQty ? 0 : qty - 1)} style={{ padding: 12 }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>−</Text>
            </Pressable>
            <Text style={{ color: '#fff', fontWeight: '800' }} accessibilityLiveRegion="polite">{qty}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${p.name}`} onPress={() => setItem(o.storeId, v.id, qty + 1)} style={{ padding: 12 }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>+</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Card>
  );
}
