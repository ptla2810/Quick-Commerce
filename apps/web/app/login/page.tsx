'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/shells';
import { api, ApiError, useApi } from '@/lib/api';
import { useAuth } from '@/components/providers/auth';
import { useCart } from '@/components/providers/cart';
import type { SessionUser } from '@/lib/types';
import { Badge, Button, Card, Input, Notice, Tabs } from '@/components/ui';

function safeNext(n: string | null) {
  return n && n.startsWith('/') && !n.startsWith('//') ? n : '/';
}

function homeFor(u: SessionUser) {
  if (u.roles.includes('SUPER_ADMIN') || u.roles.includes('ADMIN')) return '/admin';
  if (u.roles.includes('DELIVERY_PARTNER') && !u.roles.includes('SELLER')) return '/delivery';
  if (u.roles.includes('SELLER')) return '/seller';
  if (u.roles.includes('BUSINESS_BUYER')) return '/business';
  return '/';
}

function LoginInner() {
  const [tab, setTab] = useState<'otp' | 'password'>('otp');
  const params = useSearchParams();
  const router = useRouter();
  const { setUser } = useAuth();
  const { refresh } = useCart();
  const next = params.get('next');

  const finish = async (u: SessionUser) => {
    setUser(u);
    await refresh();
    router.push(next ? safeNext(next) : homeFor(u));
  };

  return (
    <AppShell hideSearch>
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-bold">Sign in</h1>
        <p className="mt-1 text-sm text-navy-700/80">
          New here?{' '}
          <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-brand-700 underline">
            Create an account
          </Link>{' '}
          or sign in with your mobile number — we will create one for you.
        </p>
        <div className="mt-4">
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: 'otp', label: 'Mobile OTP' },
              { value: 'password', label: 'Password' },
            ]}
          />
        </div>
        <Card className="mt-3">{tab === 'otp' ? <OtpForm onDone={finish} /> : <PasswordForm onDone={finish} />}</Card>
        <DemoAccounts onDone={finish} />
      </div>
    </AppShell>
  );
}

function OtpForm({ onDone }: { onDone: (u: SessionUser) => void }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [needName, setNeedName] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const request = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ devCode?: string }>('/auth/otp/request', { body: { phone } });
      setDevCode(r.devCode ?? null);
      setStep('code');
    } catch (e) {
      setErr((e as ApiError).details?.fields?.phone ?? (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ user: SessionUser }>('/auth/otp/verify', { body: { phone, code, name: name || undefined } });
      onDone(r.user);
    } catch (e) {
      if ((e as ApiError).code === 'NAME_REQUIRED') {
        setNeedName(true);
        setErr('Welcome! Tell us your name to finish creating your account. Request a new code if this one expired.');
      } else setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void (step === 'phone' ? request() : verify());
      }}
    >
      <Input label="Mobile number" inputMode="numeric" autoComplete="tel-national" placeholder="10-digit mobile number" value={phone} onChange={(e) => setPhone(e.target.value)} required disabled={step === 'code'} />
      {step === 'code' && (
        <>
          {devCode && (
            <Notice tone="orange" title="Development mode">
              SMS is simulated. Your code is <strong className="tabular-nums">{devCode}</strong>.
            </Notice>
          )}
          <Input label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} required />
          {needName && <Input label="Your name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />}
        </>
      )}
      {err && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {err}
        </p>
      )}
      <Button type="submit" block size="lg" loading={busy}>
        {step === 'phone' ? 'Send code' : 'Verify and continue'}
      </Button>
      {step === 'code' && (
        <button type="button" className="w-full text-sm font-semibold text-brand-700" onClick={() => void request()}>
          Resend code
        </button>
      )}
    </form>
  );
}

function PasswordForm({ onDone }: { onDone: (u: SessionUser) => void }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          const r = await api<{ user: SessionUser }>('/auth/login', { body: { identifier, password } });
          onDone(r.user);
        } catch (e) {
          setErr((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Input label="Mobile number or email" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
      <Input label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {err && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {err}
        </p>
      )}
      <Button type="submit" block size="lg" loading={busy}>
        Sign in
      </Button>
    </form>
  );
}

/** Development-only shortcut, shown only when the API reports demo mode. */
function DemoAccounts({ onDone }: { onDone: (u: SessionUser) => void }) {
  const status = useApi<{ demoMode: boolean }>('/dev/status');
  const accounts = useApi<{ accounts: { id: string; name: string; roles: string[]; phone: string }[] }>(status.data?.demoMode ? '/dev/demo-accounts' : null);
  const [busy, setBusy] = useState<string | null>(null);
  if (!status.data?.demoMode) return null;
  return (
    <Card className="mt-6 bg-accent-50 ring-accent-100">
      <h2 className="font-semibold">Demo accounts (development only)</h2>
      <p className="mt-1 text-xs text-navy-700/80">One-tap sign-in for seeded demo users. Disabled automatically in production.</p>
      <ul className="mt-3 divide-y divide-accent-100">
        {accounts.data?.accounts.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{a.name}</p>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {a.roles.filter((r) => r !== 'CUSTOMER' || a.roles.length === 1).map((r) => (
                  <Badge key={r} tone="navy">
                    {r.replace('_', ' ').toLowerCase()}
                  </Badge>
                ))}
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              loading={busy === a.id}
              onClick={async () => {
                setBusy(a.id);
                try {
                  const r = await api<{ user: SessionUser }>('/dev/demo-login', { body: { userId: a.id } });
                  onDone(r.user);
                } finally {
                  setBusy(null);
                }
              }}
            >
              Use
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
