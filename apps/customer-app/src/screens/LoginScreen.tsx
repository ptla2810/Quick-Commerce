import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api, ApiError } from '../api';
import { useSession, type User } from '../session';
import { useApi } from '../useApi';
import { BRAND_NAME } from '../config';
import { Button, Card, Field, Notice, Screen, s } from '../ui';

type Auth = { user: User; token: string };

export function LoginScreen() {
  const { signIn } = useSession();
  const [mode, setMode] = useState<'otp' | 'password'>('otp');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [needName, setNeedName] = useState(false);
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
      if ((e as ApiError).code === 'NAME_REQUIRED') setNeedName(true);
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Text style={[s.h1, { marginTop: 24 }]}>{BRAND_NAME}</Text>
      <Text style={[s.muted, { marginBottom: 20 }]}>Groceries and essentials from local stores near you</Text>
      <View style={[s.row, { marginBottom: 12, gap: 8 }]}>
        {(['otp', 'password'] as const).map((m) => (
          <Pressable key={m} accessibilityRole="tab" accessibilityState={{ selected: mode === m }} onPress={() => setMode(m)} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: mode === m ? '#0F2747' : '#fff', borderWidth: 1, borderColor: '#DBE3EF' }}>
            <Text style={{ color: mode === m ? '#fff' : '#0F2747', fontWeight: '700' }}>{m === 'otp' ? 'Mobile OTP' : 'Password'}</Text>
          </Pressable>
        ))}
      </View>
      <Card>
        {mode === 'otp' ? (
          <>
            <Field label="Mobile number" keyboardType="phone-pad" value={phone} onChangeText={setPhone} editable={!sent} autoComplete="tel" />
            {sent && (
              <>
                {devCode && <Notice tone="orange" text={`Development mode: SMS is simulated. Your code is ${devCode}.`} />}
                <Field label="6-digit code" keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode} autoComplete="one-time-code" />
                {needName && <Field label="Your name" value={name} onChangeText={setName} />}
              </>
            )}
            {err && <Notice tone="red" text={err} />}
            <Button
              title={sent ? 'Verify and continue' : 'Send code'}
              loading={busy}
              onPress={() =>
                run(async () => {
                  if (!sent) {
                    const r = await api<{ devCode?: string }>('/auth/otp/request', { body: { phone } });
                    setDevCode(r.devCode ?? null);
                    setSent(true);
                  } else {
                    const r = await api<Auth>('/auth/otp/verify', { body: { phone, code, name: name || undefined, client: 'mobile' } });
                    await signIn(r.token, r.user);
                  }
                })
              }
            />
          </>
        ) : (
          <>
            <Field label="Mobile number or email" autoCapitalize="none" value={phone} onChangeText={setPhone} />
            <Field label="Password" secureTextEntry value={password} onChangeText={setPassword} />
            {err && <Notice tone="red" text={err} />}
            <Button title="Sign in" loading={busy} onPress={() => run(async () => { const r = await api<Auth>('/auth/login', { body: { identifier: phone, password, client: 'mobile' } }); await signIn(r.token, r.user); })} />
          </>
        )}
      </Card>
      {demo.data && (
        <Card style={{ backgroundColor: '#FEF4EA' }}>
          <Text style={s.h2}>Demo accounts (development only)</Text>
          {demo.data.accounts
            .filter((a) => a.roles.length === 1 || a.roles.includes('BUSINESS_BUYER'))
            .map((a) => (
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
