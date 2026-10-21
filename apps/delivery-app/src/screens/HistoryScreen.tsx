import { Text, View } from 'react-native';
import { useApi } from '../useApi';
import { money } from '../format';
import { Badge, Card, Empty, Loading, Notice, Screen, s } from '../ui';
import type { Assignment } from './JobsScreen';

export function HistoryScreen() {
  const e = useApi<{ today: { deliveries: number; earnings: number }; last7Days: { deliveries: number; earnings: number }; allTime: { deliveries: number; earnings: number; failed: number }; note: string }>('/delivery/earnings');
  const h = useApi<{ assignments: Assignment[] }>('/delivery/assignments?scope=history');
  return (
    <Screen title="History & earnings">
      {e.data && (
        <Card>
          <Text style={s.body}>Today: {money(e.data.today.earnings)} · {e.data.today.deliveries} deliveries</Text>
          <Text style={s.body}>Last 7 days: {money(e.data.last7Days.earnings)} · {e.data.last7Days.deliveries} deliveries</Text>
          <Text style={s.body}>All time: {money(e.data.allTime.earnings)} · {e.data.allTime.deliveries} deliveries · {e.data.allTime.failed} failed</Text>
        </Card>
      )}
      {e.data && <Notice text={e.data.note} />}
      {h.loading && <Loading />}
      {h.data?.assignments.length === 0 && <Empty title="No completed deliveries yet" />}
      {h.data?.assignments.map((a) => (
        <Card key={a.id}>
          <View style={s.between}>
            <Text style={[s.body, { fontWeight: '700' }]}>{a.order.orderNumber}</Text>
            <Badge text={a.status.toLowerCase()} tone={a.status === 'DELIVERED' ? 'green' : a.status === 'FAILED' ? 'red' : 'navy'} />
          </View>
          <Text style={s.muted}>
            {a.store.name} → {a.customer?.address ?? '—'} · {a.completedAt ? new Date(a.completedAt).toLocaleString('en-IN') : ''}
          </Text>
          {a.status === 'DELIVERED' && <Text style={s.body}>{money(a.earning)}</Text>}
        </Card>
      ))}
    </Screen>
  );
}
