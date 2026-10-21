import { useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '../api';
import { useSession, type User } from '../session';
import { useApi } from '../useApi';
import { BRAND_NAME } from '../config';
import { Button, Card, Field, Notice, Screen, s } from '../ui';

type Auth = { user: User; token: string };

export function LoginScreen() {
  const { signIn } = useSession();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const status = useApi<{ demoMode: boolean }>('/dev/status');
  const demo = useApi<{ accounts: { id: string; name: string; roles: string[] }[] }>(status.data?.demoMode ? '/dev/demo-accounts' : null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <Text style={[s.h1, { marginTop: 24 }]}>{BRAND_NAME} Partner</Text>
      <Text style={[s.muted, { marginBottom: 20 }]}>Deliver orders from local stores in your city</Text>
      <Card>
        <Field label="Mobile number" keyboardType="phone-pad" value={phone} onChangeText={setPhone} editable={!sent} />
        {sent && (
          <>
            {devCode && <Notice tone="orange" text={`Development mode: your code is ${devCode}.`} />}
            <Field label="6-digit code" keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode} />
          </>
        )}
        {err && <Notice tone="red" text={err} />}
        <Button
          title={sent ? 'Verify' : 'Send code'}
          loading={busy}
          onPress={() =>
            run(async () => {
              if (!sent) {
                const r = await api<{ devCode?: string }>('/auth/otp/request', { body: { phone } });
                setDevCode(r.devCode ?? null);
                setSent(true);
              } else {
                const r = await api<Auth>('/auth/otp/verify', { body: { phone, code, client: 'mobile' } });
                await signIn(r.token, r.user);
              }
            })
          }
        />
      </Card>
      {demo.data && (
        <Card style={{ backgroundColor: '#FEF4EA' }}>
          <Text style={s.h2}>Demo riders (development only)</Text>
          {demo.data.accounts.filter((a) => a.roles.includes('DELIVERY_PARTNER')).map((a) => (
            <View key={a.id} style={[s.between, { marginTop: 8 }]}>
              <Text style={[s.body, { flex: 1 }]}>{a.name}</Text>
              <Button title="Use" variant="secondary" onPress={() => run(async () => { const r = await api<Auth>('/dev/demo-login', { body: { userId: a.id, client: 'mobile' } }); await signIn(r.token, r.user); })} />
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
