export interface LatLng {
  lat: number;
  lng: number;
}

/** Great-circle distance in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface DeliveryEstimateConfig {
  prepTimeMins: number;
  avgSpeedKmph: number;
  bufferMins: number;
  /** Road distance is longer than straight-line distance; this factor approximates it. */
  roadFactor: number;
}

/** A configurable estimate range, never a guarantee. */
export function estimateDeliveryWindow(distanceKm: number, cfg: DeliveryEstimateConfig): { minMins: number; maxMins: number } {
  const travel = ((distanceKm * cfg.roadFactor) / Math.max(cfg.avgSpeedKmph, 1)) * 60;
  const roundUp5 = (n: number) => Math.ceil(n / 5) * 5;
  const minMins = roundUp5(cfg.prepTimeMins + travel);
  return { minMins, maxMins: roundUp5(minMins + cfg.bufferMins) };
}

/** Minutes since midnight in India Standard Time (UTC+5:30, no DST). */
export function istMinutesOfDay(date: Date = new Date()): number {
  const utcMins = date.getUTCHours() * 60 + date.getUTCMinutes();
  return (utcMins + 330) % 1440;
}

/** Handles stores that close after midnight (closeMinute < openMinute). */
export function isWithinHours(openMinute: number, closeMinute: number, nowMinute: number): boolean {
  if (openMinute === closeMinute) return true; // open 24 hours
  if (openMinute < closeMinute) return nowMinute >= openMinute && nowMinute < closeMinute;
  return nowMinute >= openMinute || nowMinute < closeMinute;
}

export function formatMinuteOfDay(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(min).padStart(2, '0')} ${suffix}`;
}
