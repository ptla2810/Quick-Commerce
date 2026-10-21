import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, Text, View } from 'react-native';
import { api } from '../api';
import { useNav } from '../nav';
import { useSession } from '../session';
import { useApi } from '../useApi';
import { money } from '../format';
import { Badge, Button, C, Card, Empty, Field, Loading, Notice, Screen, s } from '../ui';

export interface Assignment {
  id: string;
  status: string;
  earning: number;
  completedAt: string | null;
  order: { id: string; orderNumber: string; status: string; itemCount: number; distanceKm: number | null; collectCash: number };
  store: { name: string; addressLine?: string; phone?: string; lat?: number; lng?: number };
  customer: { name: string | null; phone: string | null; address: string; lat: number | null; lng: number | null } | null;
}

const ISSUES = [
  ['CUSTOMER_UNAVAILABLE', 'Customer not available'],
  ['WRONG_ADDRESS', 'Wrong address'],
  ['CUSTOMER_REFUSED', 'Customer refused'],
  ['STORE_DELAY', 'Store delayed'],
  ['VEHICLE_ISSUE', 'Vehicle problem'],
] as const;

function navigateTo(lat?: number | null, lng?: number | null) {
  if (lat == null || lng == null) return;
  const url = Platform.OS === 'ios' ? `http://maps.apple.com/?daddr=${lat},${lng}` : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  void Linking.openURL(url);
}

function Job({ a, onChange }: { a: Assignment; onChange: () => void }) {
  const [otp, setOtp] = useState('');
  const [showOtp, setShowOtp] = useState(false);
  const [busy, setBusy] = useState(false);
  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await api(`/delivery/assignments/${a.id}/status`, { body });
      setShowOtp(false);
      onChange();
    } catch (e) {
      Alert.alert('Could not update', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const ready = ['READY_FOR_PICKUP', 'DELIVERY_FAILED'].includes(a.order.status);
  return (
    <Card>
      <View style={s.between}>
        <Text style={s.h2}>{a.order.orderNumber}</Text>
        <Badge text={a.status.replace('_', ' ').toLowerCase()} tone={a.status === 'PICKED_UP' ? 'green' : 'orange'} />
      </View>
      <Text style={s.muted}>{a.order.itemCount} items{a.order.distanceKm != null ? ` · ${a.order.distanceKm} km` : ''} · earning {money(a.earning)}</Text>
      {a.order.collectCash > 0 && <Notice tone="orange" text={`Collect cash: ${money(a.order.collectCash)}`} />}
      <Text style={[s.body, { fontWeight: '700', marginTop: 8 }]}>Pick up: {a.store.name}</Text>
      {a.store.addressLine && <Text style={s.muted}>{a.store.addressLine}</Text>}
      {a.status !== 'PICKED_UP' && (
        <View style={[s.row, { gap: 8, marginTop: 6 }]}>
          {a.store.phone && <Button title="Call store" variant="secondary" onPress={() => Linking.openURL(`tel:${a.store.phone}`)} />}
          <Button title="Navigate" variant="secondary" onPress={() => navigateTo(a.store.lat, a.store.lng)} />
        </View>
      )}
      {a.customer && (
        <>
          <Text style={[s.body, { fontWeight: '700', marginTop: 10 }]}>Drop: {a.customer.name ?? 'Customer'}</Text>
          <Text style={s.muted}>{a.customer.address}</Text>
          {a.status === 'PICKED_UP' ? (
            <View style={[s.row, { gap: 8, marginTop: 6 }]}>
              {a.customer.phone && <Button title="Call customer" variant="secondary" onPress={() => Linking.openURL(`tel:${a.customer!.phone}`)} />}
              <Button title="Navigate" variant="secondary" onPress={() => navigateTo(a.customer?.lat, a.customer?.lng)} />
            </View>
          ) : (
            <Text style={s.muted}>Full address and phone appear after pickup.</Text>
          )}
        </>
      )}
      <View style={{ marginTop: 12, gap: 8 }}>
        {a.status === 'ASSIGNED' && <Button title="Accept delivery" loading={busy} onPress={() => send({ status: 'ACCEPTED' })} />}
        {(a.status === 'ASSIGNED' || a.status === 'ACCEPTED') && <Button title={ready ? 'Confirm pickup' : 'Waiting for store to pack…'} disabled={!ready} loading={busy} onPress={() => send({ status: 'PICKED_UP' })} />}
        {a.status === 'PICKED_UP' &&
          (showOtp ? (
            <>
              <Field label="Customer's 4-digit delivery code" keyboardType="number-pad" maxLength={4} value={otp} onChangeText={setOtp} />
              <Button title="Complete delivery" disabled={otp.length !== 4} loading={busy} onPress={() => send({ status: 'DELIVERED', otp })} />
            </>
          ) : (
            <Button title="Mark delivered" onPress={() => setShowOtp(true)} />
          ))}
        <Button
          title={a.status === 'PICKED_UP' ? 'Report a problem' : 'Can’t take this delivery'}
          variant="ghost"
          onPress={() =>
            Alert.alert('What happened?', undefined, [
              ...ISSUES.map(([issueType, text]) => ({ text, onPress: () => void send({ status: 'FAILED', issueType }) })),
              { text: 'Cancel', style: 'cancel' as const },
            ])
          }
        />
      </View>
    </Card>
  );
}

export function JobsScreen() {
  const nav = useNav();
  const { signOut } = useSession();
  const me = useApi<{ partner: { isOnline: boolean; verificationStatus: string; city: { name: string } } | null }>('/delivery/me');
  const jobs = useApi<{ assignments: Assignment[] }>(me.data?.partner ? '/delivery/assignments' : null);
  const today = useApi<{ today: { deliveries: number; earnings: number } }>(me.data?.partner ? '/delivery/earnings' : null);
  const [toggling, setToggling] = useState(false);
  const p = me.data?.partner;
  const reloadJobs = jobs.reload;
  useEffect(() => {
    if (!p?.isOnline) return;
    const t = setInterval(() => void reloadJobs(), 20_000);
    return () => clearInterval(t);
  }, [p?.isOnline, reloadJobs]);

  if (me.loading) return <Screen title="Today"><Loading /></Screen>;
  if (!p)
    return (
      <Screen title="Today">
        <Empty title="Not registered as a partner" body="Register from the website with your vehicle details, then sign in again." action={<Button title="Sign out" variant="secondary" onPress={signOut} />} />
      </Screen>
    );
  return (
    <Screen title={`Today · ${p.city.name}`} right={<Button title="History" variant="ghost" onPress={() => nav.push('history')} />}>
      {p.verificationStatus !== 'APPROVED' && <Notice tone="orange" text="Your documents are being verified. You can go online after approval." />}
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: p.isOnline, disabled: toggling || p.verificationStatus !== 'APPROVED' }}
        disabled={toggling || p.verificationStatus !== 'APPROVED'}
        onPress={async () => {
          setToggling(true);
          try {
            await api('/delivery/availability', { body: { isOnline: !p.isOnline } });
            await me.reload();
          } catch (e) {
            Alert.alert('Could not update', (e as Error).message);
          } finally {
            setToggling(false);
          }
        }}
        style={{ backgroundColor: p.isOnline ? C.green : C.navy, borderRadius: 16, padding: 18, marginBottom: 12, opacity: p.verificationStatus !== 'APPROVED' ? 0.5 : 1 }}
      >
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>{p.isOnline ? 'You are online' : 'You are offline'}</Text>
        <Text style={{ color: '#fff' }}>{toggling ? 'Updating…' : p.isOnline ? 'Tap to go offline' : 'Tap to go online'}</Text>
      </Pressable>
      {today.data && <Text style={[s.body, { marginBottom: 12 }]}>Today: {today.data.today.deliveries} deliveries · {money(today.data.today.earnings)} (est.)</Text>}
      {jobs.loading && !jobs.data && <Loading />}
      {jobs.data?.assignments.length === 0 && <Empty title={p.isOnline ? 'Waiting for deliveries' : 'Go online to receive deliveries'} />}
      {jobs.data?.assignments.map((a) => <Job key={a.id} a={a} onChange={() => { void jobs.reload(); void today.reload(); }} />)}
      <Button title="Sign out" variant="ghost" onPress={signOut} style={{ marginTop: 24 }} />
    </Screen>
  );
}
