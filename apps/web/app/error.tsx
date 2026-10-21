'use client';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-5xl" aria-hidden>⚠️</p>
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="text-navy-700/80">Please try again. If the problem continues, contact support.</p>
      <button onClick={reset} className="rounded-xl bg-brand-600 px-4 py-3 font-semibold text-white">Try again</button>
    </main>
  );
}
