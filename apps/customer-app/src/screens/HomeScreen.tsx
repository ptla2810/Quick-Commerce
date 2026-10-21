import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNav } from '../nav';
import { useSession } from '../session';
import { useCart } from '../cart';
import { useApi } from '../useApi';
import { money } from '../format';
import { Badge, Button, Card, Empty, Field, Loading, Notice, Screen, s } from '../ui';
import { ProductRow, type Product } from './ProductList';

interface Store {
  id: string;
  name: string;
  isOpen: boolean;
  isDemo: boolean;
  distanceKm: number;
  etaMinMins: number;
  etaMaxMins: number;
  minOrderValue: number;
  ratingAvg: number;
  verticals: string[];
}

export function HomeScreen() {
  const nav = useNav();
  const { location, locQuery, user, signOut } = useSession();
  const { cart } = useCart();
  const [q, setQ] = useState('');
  const svc = useApi<{ serviceable: boolean; reason: string | null; stores: Store[] }>(location ? `/locations/serviceability?${locQuery}` : null);
  const recs = useApi<{ frequent: Product[]; personalised: boolean }>(location ? `/catalog/recommendations?${locQuery}` : null);

  return (
    <Screen
      title={location ? `📍 ${location.localityName}, ${location.cityName}` : 'Choose location'}
      right={<Button title="Change" variant="ghost" onPress={() => nav.push('location')} />}
    >
      <Notice tone="orange" text="Demo app: fictional stores; payments and delivery tracking are simulated." />
      <Field label="Search products" placeholder='Try "atta", "dal", "ORS"' value={q} onChangeText={setQ} returnKeyType="search" onSubmitEditing={() => q.trim() && nav.push('search', { q: q.trim() })} />
      <View style={[s.row, { gap: 8, marginBottom: 16 }]}>
        <Button title={cart ? `Cart · ${cart.itemCount} · ${money(cart.estimatedSubtotal)}` : 'Cart'} onPress={() => nav.push('cart')} style={{ flex: 1 }} />
        <Button title="My orders" variant="secondary" onPress={() => nav.push('orders')} style={{ flex: 1 }} />
      </View>
      <Text style={[s.h2, { marginBottom: 8 }]}>Stores near you</Text>
      {svc.loading && <Loading />}
      {svc.data && !svc.data.serviceable && <Empty title={svc.data.reason ?? 'Not serviceable yet'} body="Try another area." action={<Button title="Change area" onPress={() => nav.push('location')} />} />}
      {svc.data?.stores.map((st) => (
        <Card key={st.id} label={`Open ${st.name}`} onPress={() => nav.push('search', { storeId: st.id, title: st.name })}>
          <View style={s.between}>
            <Text style={[s.body, { fontWeight: '700', flex: 1 }]}>{st.name}</Text>
            {st.isDemo && <Badge text="DEMO" tone="orange" />}
          </View>
          <Text style={s.muted}>
            {st.distanceKm} km · est. {st.etaMinMins}–{st.etaMaxMins} min · min. order {money(st.minOrderValue)}
          </Text>
          <Text style={[s.muted, { color: st.isOpen ? '#157A45' : '#B42318', fontWeight: '700' }]}>{st.isOpen ? 'Open now' : 'Closed'}</Text>
        </Card>
      ))}
      {recs.data && recs.data.frequent.length > 0 && (
        <>
          <Text style={[s.h2, { marginVertical: 8 }]}>{recs.data.personalised ? 'Buy again' : 'Popular near you'}</Text>
          {recs.data.frequent.slice(0, 6).map((p) => (
            <ProductRow key={p.id} p={p} />
          ))}
        </>
      )}
      <Pressable accessibilityRole="button" onPress={signOut} style={{ marginTop: 24, alignItems: 'center' }}>
        <Text style={s.muted}>Signed in as {user?.name} · Sign out</Text>
      </Pressable>
    </Screen>
  );
}
