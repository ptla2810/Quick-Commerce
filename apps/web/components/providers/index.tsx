'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from './auth';
import { LocationProvider } from './location';
import { CartProvider } from './cart';
import { ToastProvider } from './toast';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <LocationProvider>
          <CartProvider>{children}</CartProvider>
        </LocationProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
