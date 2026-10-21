import { estimateDeliveryWindow, haversineKm, isWithinHours, istMinutesOfDay, type Vertical } from '@padosi/shared';
import type { Store } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getSettings } from '../lib/settings';
import { badRequest, notFound } from '../lib/errors';

export interface LocationInput {
  localityId: string;
  lat?: number | null;
  lng?: number | null;
}

export interface StoreAvailability {
  store: Store;
  distanceKm: number;
  isOpen: boolean;
  etaMinMins: number;
  etaMaxMins: number;
}

/** Store must be active, its seller approved, and not temporarily closed to take orders. */
const storeUsable = { isActive: true, sellerOrg: { verificationStatus: 'APPROVED' as const } };

export async function resolveLocation(loc: LocationInput) {
  const locality = await prisma.locality.findUnique({ where: { id: loc.localityId }, include: { zone: true, city: true } });
  if (!locality) throw notFound('Locality');
  const point = { lat: loc.lat ?? locality.lat, lng: loc.lng ?? locality.lng };
  const serviceable = !!locality.zone?.isActive && locality.city.isActive;
  return { locality, point, serviceable };
}

export function storeIsOpen(store: Pick<Store, 'openMinute' | 'closeMinute' | 'isTemporarilyClosed'>, at = new Date()) {
  return !store.isTemporarilyClosed && isWithinHours(store.openMinute, store.closeMinute, istMinutesOfDay(at));
}

/**
 * Stores that can deliver to a location: the store lists the locality in its service area,
 * the point is within its delivery radius, and the locality's zone is active.
 */
export async function serviceableStores(loc: LocationInput, vertical?: Vertical): Promise<StoreAvailability[]> {
  const { locality, point, serviceable } = await resolveLocation(loc);
  if (!serviceable) return [];
  const stores = await prisma.store.findMany({
    where: {
      ...storeUsable,
      serviceAreas: { some: { localityId: locality.id } },
      ...(vertical ? { verticals: { has: vertical } } : {}),
    },
  });
  const settings = await getSettings();
  return stores
    .map((store) => {
      const distanceKm = Math.round(haversineKm(point, store) * 10) / 10;
      const eta = estimateDeliveryWindow(distanceKm, { prepTimeMins: store.prepTimeMins, ...settings.delivery });
      return { store, distanceKm, isOpen: storeIsOpen(store), etaMinMins: eta.minMins, etaMaxMins: eta.maxMins };
    })
    .filter((s) => s.distanceKm <= s.store.deliveryRadiusKm)
    .sort((a, b) => Number(b.isOpen) - Number(a.isOpen) || a.distanceKm - b.distanceKm);
}

export async function assertStoreServes(storeId: string, loc: LocationInput): Promise<StoreAvailability> {
  const list = await serviceableStores(loc);
  const found = list.find((s) => s.store.id === storeId);
  if (!found) throw badRequest('UNSERVICEABLE', 'This store does not deliver to the selected address');
  return found;
}

export function publicStore(s: StoreAvailability | { store: Store; distanceKm?: number; isOpen?: boolean; etaMinMins?: number; etaMaxMins?: number }) {
  const { store } = s;
  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    verticals: store.verticals,
    addressLine: store.addressLine,
    phone: store.phone,
    openMinute: store.openMinute,
    closeMinute: store.closeMinute,
    isTemporarilyClosed: store.isTemporarilyClosed,
    minOrderValue: store.minOrderValue,
    baseDeliveryFee: store.baseDeliveryFee,
    freeDeliveryAbove: store.freeDeliveryAbove,
    pickupEnabled: store.pickupEnabled,
    scheduledDeliveryEnabled: store.scheduledDeliveryEnabled,
    ratingAvg: store.ratingAvg,
    ratingCount: store.ratingCount,
    isDemo: store.isDemo,
    distanceKm: s.distanceKm ?? null,
    isOpen: s.isOpen ?? storeIsOpen(store),
    etaMinMins: s.etaMinMins ?? null,
    etaMaxMins: s.etaMaxMins ?? null,
  };
}
