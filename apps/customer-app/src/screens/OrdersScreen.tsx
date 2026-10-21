import { Text, View } from 'react-native';
import { useNav } from '../nav';
import { useApi } from '../useApi';
import { label, money } from '../format';
import { Badge, Card, Empty, Loading, Screen, s } from '../ui';

export function OrdersScreen() {
  const nav = useNav();
  const { data, loading } = useApi<{ orders: { id: string; orderNumber: string; status: string; grandTotal: number; placedAt: string; store: { name: string }; preview: string[] }[] }>('/orders');
  return (
    <Screen title="My orders">
      {loading && <Loading />}
      {data?.orders.length === 0 && <Empty title="No orders yet" />}
      {data?.orders.map((o) => (
        <Card key={o.id} label={`Order ${o.orderNumber}`} onPress={() => nav.push('order', { id: o.id })}>
          <View style={s.between}>
            <Text style={[s.body, { fontWeight: '700', flex: 1 }]}>{o.store.name}</Text>
            <Badge text={label(o.status)} tone={o.status === 'DELIVERED' ? 'green' : ['CANCELLED', 'REJECTED'].includes(o.status) ? 'red' : 'navy'} />
          </View>
          <Text style={s.muted} numberOfLines={1}>{o.preview.join(', ')}</Text>
          <Text style={s.muted}>
            {o.orderNumber} · {new Date(o.placedAt).toLocaleDateString('en-IN')} · {money(o.grandTotal)}
          </Text>
        </Card>
      ))}
    </Screen>
  );
}
