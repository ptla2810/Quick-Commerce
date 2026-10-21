import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: { default: `${BRAND.name} – ${BRAND.tagline}`, template: `%s · ${BRAND.name}` },
  description: 'Groceries, HoReCa supplies and pharmacy essentials from verified local stores near you.',
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0F2747',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
