import type { OrderStatus } from './enums';

export type OrderActor = 'CUSTOMER' | 'SELLER' | 'DELIVERY' | 'ADMIN' | 'SYSTEM';

/**
 * Every allowed fulfilment-status transition and who may perform it.
 * Payment status is tracked separately on the order and is not part of this machine.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, Partial<Record<OrderStatus, OrderActor[]>>> = {
  // Prescription orders wait for a pharmacist before anything else can happen.
  AWAITING_RX_REVIEW: {
    PLACED: ['SELLER'],
    PENDING_PAYMENT: ['SELLER'],
    REJECTED: ['SELLER', 'ADMIN'],
    CANCELLED: ['CUSTOMER', 'ADMIN', 'SYSTEM'],
  },
  PENDING_PAYMENT: {
    PLACED: ['SYSTEM'],
    CANCELLED: ['CUSTOMER', 'ADMIN', 'SYSTEM'],
  },
  PLACED: {
    ACCEPTED: ['SELLER', 'ADMIN'],
    REJECTED: ['SELLER', 'ADMIN'],
    CANCELLED: ['CUSTOMER', 'ADMIN', 'SYSTEM'],
  },
  ACCEPTED: {
    PREPARING: ['SELLER', 'ADMIN'],
    CANCELLED: ['SELLER', 'ADMIN'],
  },
  PREPARING: {
    READY_FOR_PICKUP: ['SELLER', 'ADMIN'],
    CANCELLED: ['SELLER', 'ADMIN'],
  },
  READY_FOR_PICKUP: {
    OUT_FOR_DELIVERY: ['DELIVERY', 'ADMIN'],
    // Only valid for store-pickup orders; enforced by canTransition.
    DELIVERED: ['SELLER', 'ADMIN'],
    CANCELLED: ['ADMIN'],
  },
  OUT_FOR_DELIVERY: {
    DELIVERED: ['DELIVERY', 'ADMIN'],
    DELIVERY_FAILED: ['DELIVERY', 'ADMIN'],
  },
  DELIVERY_FAILED: {
    OUT_FOR_DELIVERY: ['DELIVERY', 'ADMIN'],
    CANCELLED: ['ADMIN'],
  },
  DELIVERED: {},
  CANCELLED: {},
  REJECTED: {},
};

export const TERMINAL_ORDER_STATUSES: OrderStatus[] = ['DELIVERED', 'CANCELLED', 'REJECTED'];

/** Statuses in which stock is held for the order. Leaving them for CANCELLED/REJECTED restores stock. */
export const STOCK_HOLDING_STATUSES: OrderStatus[] = [
  'AWAITING_RX_REVIEW',
  'PENDING_PAYMENT',
  'PLACED',
  'ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'DELIVERY_FAILED',
];

export interface TransitionContext {
  fulfilmentType?: 'DELIVERY' | 'PICKUP';
}

export function canTransition(from: OrderStatus, to: OrderStatus, actor: OrderActor, ctx: TransitionContext = {}): boolean {
  const allowed = ORDER_TRANSITIONS[from]?.[to];
  if (!allowed || !allowed.includes(actor)) return false;
  if (from === 'READY_FOR_PICKUP' && to === 'DELIVERED' && ctx.fulfilmentType !== 'PICKUP') return false;
  if (from === 'READY_FOR_PICKUP' && to === 'OUT_FOR_DELIVERY' && ctx.fulfilmentType === 'PICKUP') return false;
  return true;
}

export function nextStatusesFor(from: OrderStatus, actor: OrderActor, ctx: TransitionContext = {}): OrderStatus[] {
  return (Object.keys(ORDER_TRANSITIONS[from]) as OrderStatus[]).filter((to) => canTransition(from, to, actor, ctx));
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
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

/** The happy-path progression shown on the customer tracking timeline. */
export const ORDER_PROGRESS_STEPS: OrderStatus[] = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED'];
