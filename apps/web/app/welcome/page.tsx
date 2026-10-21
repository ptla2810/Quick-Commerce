'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BRAND } from '@/lib/brand';
import { Button } from '@/components/ui';

const SLIDES = [
  { emoji: '🏪', title: `Your local shops, online`, body: 'Order from verified kirana stores, wholesalers and pharmacies in your own neighbourhood.' },
  { emoji: '🛵', title: 'Delivered by local partners', body: 'Each store shows an honest delivery estimate. Track your order live and pay by cash or UPI.' },
  { emoji: '🍽️', title: 'For homes and businesses', body: 'Hotels, restaurants and caterers get wholesale prices, quotations and GST invoices.' },
];

export default function WelcomePage() {
  const [i, setI] = useState(0);
  const router = useRouter();
  const done = () => {
    try {
      localStorage.setItem('padosi.welcomed', '1');
    } catch {
      // ignore
    }
    router.push('/location');
  };
  const s = SLIDES[i];
  return (
    <main className="flex min-h-dvh flex-col bg-navy-800 px-6 py-10 text-white">
      <p className="text-xl font-extrabold">{BRAND.name}</p>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center text-center" aria-live="polite">
        <span className="text-7xl" aria-hidden>
          {s.emoji}
        </span>
        <h1 className="mt-6 text-3xl font-bold">{s.title}</h1>
        <p className="mt-3 text-lg text-white/80">{s.body}</p>
        <div className="mt-6 flex gap-2" aria-label={`Step ${i + 1} of ${SLIDES.length}`}>
          {SLIDES.map((_, k) => (
            <span key={k} className={`h-2 rounded-full ${k === i ? 'w-6 bg-accent-500' : 'w-2 bg-white/30'}`} />
          ))}
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-md flex-col gap-3">
        <Button size="lg" variant="accent" onClick={() => (i < SLIDES.length - 1 ? setI(i + 1) : done())}>
          {i < SLIDES.length - 1 ? 'Next' : 'Choose my location'}
        </Button>
        <button className="h-12 text-sm font-semibold text-white/80" onClick={done}>
          Skip
        </button>
      </div>
    </main>
  );
}
