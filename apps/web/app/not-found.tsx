import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-5xl" aria-hidden>🧭</p>
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="text-navy-700/80">The page you are looking for does not exist or has moved.</p>
      <Link href="/" className="rounded-xl bg-brand-600 px-4 py-3 font-semibold text-white">Go home</Link>
    </main>
  );
}
