'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell, RequireAuth } from '@/components/shells';
import { useAuth } from '@/components/providers/auth';
import { useToast } from '@/components/providers/toast';
import { useLocation } from '@/components/providers/location';
import { api, useApi } from '@/lib/api';
import { AddressForm, type Address } from '@/components/address';
import { Badge, Button, Card, Checkbox, Input, Modal, PageTitle, SectionHeader, Select, Spinner, VerificationBadge } from '@/components/ui';
import type { SessionUser } from '@/lib/types';

function AccountInner() {
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const { setLocation } = useLocation();
  const addresses = useApi<{ addresses: Address[] }>('/me/addresses');
  const favs = useApi<{ products: { id: string; slug: string; name: string; category: { icon: string | null } }[]; stores: { id: string; slug: string; name: string }[] }>('/me/favourites');
  const [name, setName] = useState(user!.name);
  const [email, setEmail] = useState(user!.email ?? '');
  const [lang, setLang] = useState(user!.preferredLanguage);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const u = user!;

  const save = async (patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      const r = await api<{ user: SessionUser }>('/auth/me', { method: 'PATCH', body: patch });
      setUser(r.user);
      toast.show('Saved');
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-3">
        <SectionHeader title="Profile" />
        <p className="text-sm">
          Mobile: <strong>{u.phone ?? 'not added'}</strong> {u.phoneVerified && <Badge tone="green">Verified</Badge>}
        </p>
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Select label="Preferred language" value={lang} onChange={(e) => setLang(e.target.value)} hint="Hindi interface is planned; this preference is stored for notifications.">
          <option value="en">English</option>
          <option value="hi">हिन्दी (Hindi)</option>
        </Select>
        <Button loading={saving} onClick={() => save({ name, email: email || null, preferredLanguage: lang })}>
          Save profile
        </Button>
        <hr className="border-navy-100" />
        <Checkbox checked={u.marketingConsent} onChange={(v) => save({ marketingConsent: v })} label="Send me offers and promotions" hint="Order and account updates are always sent." />
      </Card>

      <Card className="space-y-3">
        <SectionHeader title="Saved addresses" action={<Button size="sm" variant="secondary" onClick={() => setAdding(true)}>Add</Button>} />
        {addresses.loading && <Spinner />}
        <ul className="space-y-2">
          {addresses.data?.addresses.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-3 rounded-xl bg-navy-50 p-3">
              <div className="text-sm">
                <p className="font-semibold">
                  {a.label} {a.isDefault && <Badge tone="green">Default</Badge>} {!a.serviceable && <Badge tone="red">Not serviceable</Badge>}
                </p>
                <p className="text-navy-700/80">
                  {a.line1}, {a.locality.name}, {a.locality.city} {a.postalCode}
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <Button size="sm" variant="ghost" onClick={() => { setLocation({ localityId: a.locality.id, localityName: a.locality.name, cityName: a.locality.city, postalCode: a.postalCode, lat: a.lat, lng: a.lng, addressId: a.id, addressLabel: a.label }); toast.show(`Delivering to ${a.label}`); }}>
                  Deliver here
                </Button>
                <Button size="sm" variant="ghost" className="!text-red-700" onClick={async () => { await api(`/me/addresses/${a.id}`, { method: 'DELETE' }); void addresses.reload(); }}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <SectionHeader title="Favourites" />
        {favs.data && favs.data.products.length + favs.data.stores.length === 0 && <p className="text-sm text-navy-700/80">Tap the heart on a product or store to save it here.</p>}
        <ul className="space-y-1 text-sm">
          {favs.data?.stores.map((s) => (
            <li key={s.id}>
              🏪{' '}
              <Link className="font-semibold hover:underline" href={`/store/${s.slug}`}>
                {s.name}
              </Link>
            </li>
          ))}
          {favs.data?.products.map((p) => (
            <li key={p.id}>
              {p.category.icon}{' '}
              <Link className="font-semibold hover:underline" href={`/product/${p.slug}`}>
                {p.name}
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="space-y-2">
        <SectionHeader title="More" />
        <Link href="/orders" className="block font-semibold text-brand-700">My orders →</Link>
        <Link href="/chemist/prescriptions" className="block font-semibold text-brand-700">My prescriptions →</Link>
        <Link href="/support" className="block font-semibold text-brand-700">Help & support →</Link>
        <Link href="/business" className="block font-semibold text-brand-700">
          Business account {u.businessProfile && <VerificationBadge status={u.businessProfile.verificationStatus} />} →
        </Link>
        {!u.roles.includes('SELLER') && <Link href="/seller/onboarding" className="block font-semibold text-brand-700">Register your shop as a seller →</Link>}
        {!u.roles.includes('DELIVERY_PARTNER') && <Link href="/delivery/register" className="block font-semibold text-brand-700">Become a delivery partner →</Link>}
        <Button variant="secondary" className="mt-2" onClick={async () => { await logout(); router.push('/'); }}>
          Sign out
        </Button>
      </Card>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add address">
        {adding && <AddressForm onSaved={() => { setAdding(false); void addresses.reload(); }} />}
      </Modal>
    </div>
  );
}

export default function AccountPage() {
  return (
    <AppShell>
      <PageTitle title="My account" />
      <RequireAuth>
        <AccountInner />
      </RequireAuth>
    </AppShell>
  );
}
