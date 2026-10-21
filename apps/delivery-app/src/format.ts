// Display helpers mirrored from packages/shared (money/orderStateMachine). The server stays authoritative.
const whole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const withPaise = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (paise: number | null | undefined) => (paise == null ? '—' : (paise % 100 === 0 ? whole : withPaise).format(paise / 100));

export const STATUS_LABELS: Record<string, string> = {
  AWAITING_RX_REVIEW: 'Awaiting pharmacist review',
  PENDING_PAYMENT: 'Awaiting payment',
  PLACED: 'Order placed',
  ACCEPTED: 'Accepted by store',
  PREPARING: 'Being packed',
  READY_FOR_PICKUP: 'Ready for pickup',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERY_FAILED: 'Delivery attempt failed',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected',
};
export const PROGRESS = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED'];
export const label = (s: string) => STATUS_LABELS[s] ?? s.replace(/_/g, ' ').toLowerCase();
