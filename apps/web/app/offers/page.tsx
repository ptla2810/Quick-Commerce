'use client';

import { useState } from 'react';
import { Copy } from 'lucide-react';
import { AppShell, RequireAuth } from '@/components/shells';
import { useApi } from '@/lib/api';
import { money } from '@/components/commerce';
import { Badge, Card, EmptyState, ErrorState, PageTitle, Spinner } from '@/components/ui';

interface Coupon {
  code: string;
  description: string;
  discountType: string;
  value: number;
  maxDiscount: number | null;
  minOrderValue: number;
  vertical: string | null;
  storeName: string | null;
  cityName: string | null;
  validTo: string;
  firstOrderOnly: boolean;
  usedUp: boolean;
}

function OffersInner() {
  const { data, error, loading, reload } = useApi<{ coupons: Coupon[] }>('/me/coupons');
  const [copied, setCopied] = useState<string | null>(null);
  if (loading) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data?.coupons.length) return <EmptyState icon="🏷️" title="No offers right now" body="Check back soon for new deals from local stores." />;
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {data.coupons.map((c) => (
        <li key={c.code}>
          <Card className={c.usedUp ? 'opacity-60' : ''}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold">{c.description}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {c.vertical && <Badge>{c.vertical.toLowerCase()}</Badge>}
                  {c.storeName && <Badge tone="navy">Only at {c.storeName}</Badge>}
                  {c.firstOrderOnly && <Badge tone="orange">First order</Badge>}
                  {c.usedUp && <Badge tone="gray">Already used</Badge>}
                </div>
                <p className="mt-2 text-xs text-navy-700/80">
                  Min. order {money(c.minOrderValue)}
                  {c.maxDiscount ? ` · max discount ${money(c.maxDiscount)}` : ''} · valid till {new Date(c.validTo).toLocaleDateString('en-IN')}
                </p>
              </div>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(c.code);
                  } catch {
                    // clipboard unavailable: the code is visible anyway
                  }
                  setCopied(c.code);
                }}
                className="flex shrink-0 items-center gap-1 rounded-xl border-2 border-dashed border-brand-500 px-3 py-2 font-mono font-bold text-brand-700"
                aria-label={`Copy code ${c.code}`}
              >
                {c.code} <Copy className="h-4 w-4" aria-hidden />
              </button>
            </div>
            {copied === c.code && <p className="mt-2 text-xs font-semibold text-brand-700">Copied. Apply it at checkout.</p>}
          </Card>
        </li>
      ))}
    </ul>
  );
}

export default function OffersPage() {
  return (
    <AppShell>
      <PageTitle title="Offers & coupons" subtitle="Discounts are applied and verified at checkout." />
      <RequireAuth message="Sign in to see offers available to you.">
        <OffersInner />
      </RequireAuth>
    </AppShell>
  );
}
