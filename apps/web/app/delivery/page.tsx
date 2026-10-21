'use client';

import { useEffect, useState } from 'react';
import { DeliveryShell, AssignmentCard, type Assignment } from '@/components/delivery';
import { useAuth } from '@/components/providers/auth';
import { useToast } from '@/components/providers/toast';
import { api, useApi } from '@/lib/api';
import { money } from '@/components/commerce';
import { EmptyState, ErrorState, LinkButton, Notice, PageTitle, Spinner, Stat, VerificationBadge } from '@/components/ui';

interface Partner {
  id: string;
  isOnline: boolean;
  verificationStatus: string;
  vehicleType: string;
  city: { name: string };
}

function Today() {
  const toast = useToast();
  const me = useApi<{ partner: Partner | null }>('/delivery/me');
  const partner = me.data?.partner;
  const jobs = useApi<{ assignments: Assignment[] }>(partner ? '/delivery/assignments' : null);
  const earnings = useApi<{ today: { deliveries: number; earnings: number } }>(partner ? '/delivery/earnings' : null);
  const [toggling, setToggling] = useState(false);

  const reloadJobs = jobs.reload;
  useEffect(() => {
    if (!partner?.isOnline) return;
    const t = setInterval(() => void reloadJobs(), 20_000);
    return () => clearInterval(t);
  }, [partner?.isOnline, reloadJobs]);

  if (me.loading) return <Spinner />;
  if (me.error) return <ErrorState error={me.error} onRetry={me.reload} />;
  if (!partner) return <EmptyState icon="🛵" title="Become a delivery partner" body="Register with your vehicle details to start delivering in your city." action={<LinkButton href="/delivery/register">Register</LinkButton>} />;

  const toggle = async () => {
    setToggling(true);
    try {
      const pos: { lat?: number; lng?: number } = await new Promise((res) =>
        navigator.geolocation ? navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res({}), { timeout: 3000 }) : res({}),
      );
      await api('/delivery/availability', { body: { isOnline: !partner.isOnline, ...pos } });
      await me.reload();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setToggling(false);
    }
  };

  return (
    <>
      <PageTitle title="Today" subtitle={<span className="flex items-center gap-2">{partner.city.name} · {partner.vehicleType.toLowerCase().replace('_', ' ')} <VerificationBadge status={partner.verificationStatus} /></span>} />
      {partner.verificationStatus !== 'APPROVED' && (
        <div className="mb-4">
          <Notice tone="orange">Your documents are being verified. You can go online once approved.</Notice>
        </div>
      )}
      <button
        onClick={toggle}
        disabled={toggling || partner.verificationStatus !== 'APPROVED'}
        aria-pressed={partner.isOnline}
        className={`mb-4 flex h-16 w-full items-center justify-between rounded-2xl px-5 text-lg font-bold text-white disabled:opacity-50 ${partner.isOnline ? 'bg-brand-600' : 'bg-navy-700'}`}
      >
        <span>{partner.isOnline ? 'You are online' : 'You are offline'}</span>
        <span className="text-sm font-semibold">{toggling ? '…' : partner.isOnline ? 'Go offline' : 'Go online'}</span>
      </button>
      {earnings.data && (
        <div className="mb-4 grid grid-cols-2 gap-3">
          <Stat label="Deliveries today" value={earnings.data.today.deliveries} />
          <Stat label="Earned today (est.)" value={money(earnings.data.today.earnings)} tone="green" />
        </div>
      )}
      {jobs.loading && !jobs.data && <Spinner />}
      {jobs.data?.assignments.length === 0 && <EmptyState icon="⏳" title={partner.isOnline ? 'Waiting for deliveries' : 'Go online to receive deliveries'} body="Stores and our operations team assign deliveries near you." />}
      <div className="grid gap-4 md:grid-cols-2">
        {jobs.data?.assignments.map((a) => (
          <AssignmentCard key={a.id} a={a} onChange={() => { void jobs.reload(); void earnings.reload(); }} />
        ))}
      </div>
    </>
  );
}

export default function DeliveryHome() {
  const { user } = useAuth();
  return <DeliveryShell>{user && <Today />}</DeliveryShell>;
}
