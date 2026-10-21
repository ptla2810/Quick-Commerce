import type { OrderStatus, Vertical } from '@padosi/shared';
import { prisma } from './prisma';

export interface PlatformSettings {
  delivery: { avgSpeedKmph: number; bufferMins: number; roadFactor: number; perKmFee: number; freeKm: number };
  commissionBps: Record<Vertical, number>;
  customerCancellableStatuses: OrderStatus[];
  deliveryPartnerPayout: { basePerDelivery: number; perKm: number };
  codMaxOrderValue: number;
  pendingPaymentTimeoutMins: number;
  returnWindowHours: number;
  support: { phone: string; email: string; hours: string };
}

export const DEFAULT_SETTINGS: PlatformSettings = {
  delivery: { avgSpeedKmph: 18, bufferMins: 10, roadFactor: 1.3, perKmFee: 500, freeKm: 2 },
  commissionBps: { GROCERY: 800, HORECA: 500, CHEMIST: 1000 },
  customerCancellableStatuses: ['AWAITING_RX_REVIEW', 'PENDING_PAYMENT', 'PLACED'],
  deliveryPartnerPayout: { basePerDelivery: 3000, perKm: 500 },
  codMaxOrderValue: 500000,
  pendingPaymentTimeoutMins: 15,
  returnWindowHours: 48,
  support: { phone: '1800-000-0000 (demo)', email: 'support@padosi.example', hours: '8 AM – 10 PM, all days' },
};

let cache: { at: number; value: PlatformSettings } | null = null;

export async function getSettings(): Promise<PlatformSettings> {
  if (cache && Date.now() - cache.at < 30_000) return cache.value;
  const rows = await prisma.platformSetting.findMany();
  const value = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) value[r.key] = r.value;
  cache = { at: Date.now(), value: value as unknown as PlatformSettings };
  return cache.value;
}

export function invalidateSettings() {
  cache = null;
}
