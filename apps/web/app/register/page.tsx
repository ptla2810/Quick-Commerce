'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/shells';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/components/providers/auth';
import type { SessionUser } from '@/lib/types';
import { Button, Card, Checkbox, Input } from '@/components/ui';

function RegisterInner() {
  const [f, setF] = useState({ name: '', phone: '', email: '', password: '' });
  const [consent, setConsent] = useState(false);
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { setUser } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get('next');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <AppShell hideSearch>
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-bold">Create your account</h1>
        <p className="mt-1 text-sm text-navy-700/80">
          Already have one?{' '}
          <Link href="/login" className="font-semibold text-brand-700 underline">
            Sign in
          </Link>
        </p>
        <Card className="mt-4">
          <form
            className="space-y-4"
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              if (!terms) {
                setErr('Please accept the terms and privacy policy to continue.');
                return;
              }
              setBusy(true);
              setErr(null);
              setErrors({});
              try {
                const r = await api<{ user: SessionUser }>('/auth/register', {
                  body: { name: f.name, phone: f.phone || undefined, email: f.email || undefined, password: f.password, marketingConsent: consent },
                });
                setUser(r.user);
                router.push(next && next.startsWith('/') && !next.startsWith('//') ? next : '/location');
              } catch (e) {
                const ae = e as ApiError;
                setErrors(ae.details?.fields ?? {});
                setErr(ae.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Input label="Full name" autoComplete="name" value={f.name} onChange={set('name')} error={errors.name} required />
            <Input label="Mobile number" inputMode="numeric" autoComplete="tel-national" value={f.phone} onChange={set('phone')} error={errors.phone} hint="Used for delivery updates. Mobile or email is required." />
            <Input label="Email (optional)" type="email" autoComplete="email" value={f.email} onChange={set('email')} error={errors.email} />
            <Input label="Password" type="password" autoComplete="new-password" value={f.password} onChange={set('password')} error={errors.password} hint="At least 8 characters with a letter and a number" required />
            <Checkbox checked={terms} onChange={setTerms} label="I agree to the terms of use and privacy policy" />
            <Checkbox checked={consent} onChange={setConsent} label="Send me offers and promotions (optional)" hint="Order updates are always sent. You can change this any time." />
            {err && (
              <p role="alert" className="text-sm font-medium text-red-700">
                {err}
              </p>
            )}
            <Button type="submit" block size="lg" loading={busy}>
              Create account
            </Button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterInner />
    </Suspense>
  );
}
