import {
  canTransition,
  commissionFor,
  ONLINE_PAYMENT_METHODS,
  ORDER_STATUS_LABELS,
  STOCK_HOLDING_STATUSES,
  type OrderActor,
  type OrderStatus,
  type PaymentMethod,
  type PlaceOrderInput,
} from '@padosi/shared';
import type { InventoryChangeReason, Order, PaymentStatus } from '@prisma/client';
import { prisma, Prisma, type Tx } from '../lib/prisma';
import { AppError, conflict, forbidden, notFound, unprocessable } from '../lib/errors';
import { numericCode, referenceNumber } from '../lib/crypto';
import { getSettings } from '../lib/settings';
import { notify, sellerUserIds } from '../providers/notifications';
import { payments } from '../providers/payments';
import { buildQuote } from './quote';
import { logger } from '../lib/logger';

/** Atomically change stock, refusing to go below zero, and record the change. */
export async function adjustStock(
  tx: Tx,
  args: { storeId: string; variantId: string; delta: number; reason: InventoryChangeReason; actorUserId?: string | null; orderId?: string; note?: string },
) {
  const rows = await tx.$queryRaw<{ id: string; stockQty: number }[]>`
    UPDATE "StoreInventory"
       SET "stockQty" = "stockQty" + ${args.delta}, "updatedAt" = now()
     WHERE "storeId" = ${args.storeId} AND "variantId" = ${args.variantId} AND "stockQty" + ${args.delta} >= 0
     RETURNING id, "stockQty"`;
  const row = rows[0];
  if (!row) return null;
  await tx.inventoryAuditLog.create({
    data: {
      inventoryId: row.id,
      reason: args.reason,
      delta: args.delta,
      stockBefore: row.stockQty - args.delta,
      stockAfter: row.stockQty,
      actorUserId: args.actorUserId ?? null,
      orderId: args.orderId,
      note: args.note,
    },
  });
  return row;
}

export interface PlaceOrderResult {
  order: Order;
  replayed: boolean;
}

/**
 * Creates an order from the user's cart. Safe against double-submits (idempotency key per user)
 * and overselling (conditional stock decrement inside the transaction).
 */
export async function placeOrder(userId: string, input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const existing = await prisma.order.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey: input.idempotencyKey } } });
  if (existing) return { order: existing, replayed: true };

  const quote = await buildQuote(userId, input);
  if (quote.issues.length || !quote.totals || !quote.storeId) {
    throw unprocessable('CHECKOUT_INVALID', quote.issues[0]?.message ?? 'Your cart cannot be checked out', { issues: quote.issues });
  }
  const totals = quote.totals;
  const method = input.paymentMethod as PaymentMethod;
  const isOnline = ONLINE_PAYMENT_METHODS.includes(method);

  let status: OrderStatus;
  if (quote.requiresPrescription) status = 'AWAITING_RX_REVIEW';
  else if (isOnline) status = 'PENDING_PAYMENT';
  else status = 'PLACED';
  const paymentStatus: PaymentStatus = method === 'COD' ? 'COD_PENDING' : method === 'BUSINESS_CREDIT' ? 'CREDIT_DUE' : 'PENDING';

  const saleAmount = totals.itemsSubtotal - quote.sellerFundedDiscount;
  const commissionAmount = commissionFor(saleAmount, quote.commissionRateBps);
  const addr = quote.address;
  const bp = quote.businessProfileId ? await prisma.businessProfile.findUnique({ where: { id: quote.businessProfileId } }) : null;

  try {
    const order = await prisma.$transaction(
      async (tx) => {
        const orderId = (await tx.$queryRaw<{ id: string }[]>`SELECT gen_random_uuid()::text AS id`)[0].id;
        for (const line of quote.lines) {
          const ok = await adjustStock(tx, {
            storeId: quote.storeId!,
            variantId: line.variantId,
            delta: -line.quantity,
            reason: 'ORDER_PLACED',
            actorUserId: userId,
            orderId,
          });
          if (!ok) throw conflict('OUT_OF_STOCK', `${line.product.name} (${line.variant.name}) just went out of stock`, { variantId: line.variantId });
        }

        if (quote.coupon?.usageLimit) {
          const used = await tx.couponRedemption.count({ where: { couponId: quote.coupon.id } });
          if (used >= quote.coupon.usageLimit) throw conflict('COUPON_EXHAUSTED', 'This coupon has just been fully redeemed');
        }

        if (method === 'BUSINESS_CREDIT') {
          const updated = await tx.$executeRaw`
            UPDATE "BusinessProfile" SET "creditUsed" = "creditUsed" + ${totals.grandTotal}
             WHERE id = ${quote.businessProfileId} AND "creditApproved" = true AND "creditUsed" + ${totals.grandTotal} <= "creditLimit"`;
          if (updated !== 1) throw conflict('CREDIT_LIMIT', 'This order exceeds your available credit');
        }

        const lineBy = new Map(totals.lines.map((l) => [l.key, l]));
        const created = await tx.order.create({
          data: {
            id: orderId,
            orderNumber: referenceNumber('PD'),
            userId,
            storeId: quote.storeId!,
            addressId: addr?.id ?? null,
            channel: input.mode,
            vertical: quote.vertical,
            status,
            paymentStatus,
            paymentMethod: method,
            fulfilmentType: input.fulfilmentType,
            idempotencyKey: input.idempotencyKey,
            deliveryAddress: addr
              ? {
                  contactName: addr.contactName,
                  contactPhone: addr.contactPhone,
                  line1: addr.line1,
                  line2: addr.line2,
                  landmark: addr.landmark,
                  locality: addr.locality.name,
                  city: addr.locality.city.name,
                  state: addr.locality.city.state,
                  postalCode: addr.postalCode,
                  lat: addr.lat,
                  lng: addr.lng,
                }
              : Prisma.JsonNull,
            buyerGstin: bp?.gstin ?? null,
            buyerBusinessName: bp?.businessName ?? null,
            intraState: quote.intraState,
            itemsSubtotal: totals.itemsSubtotal,
            mrpTotal: totals.mrpTotal,
            discountTotal: totals.discount,
            sellerFundedDiscount: quote.sellerFundedDiscount,
            deliveryFee: totals.deliveryFee,
            taxableValue: totals.taxableValue,
            taxTotal: totals.taxTotal,
            grandTotal: totals.grandTotal,
            commissionRateBps: quote.commissionRateBps,
            commissionAmount,
            couponCode: quote.coupon?.code ?? null,
            distanceKm: quote.storeAvailability?.distanceKm ?? null,
            etaMinMins: quote.storeAvailability?.etaMinMins ?? null,
            etaMaxMins: quote.storeAvailability?.etaMaxMins ?? null,
            scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
            notes: input.notes ?? null,
            deliveryOtp: input.fulfilmentType === 'DELIVERY' ? numericCode(4) : null,
            prescriptionId: quote.requiresPrescription ? input.prescriptionId! : null,
            items: {
              create: quote.lines.map((l) => {
                const t = lineBy.get(l.variantId)!;
                return {
                  variantId: l.variantId,
                  productName: l.product.name,
                  variantName: l.variant.name,
                  sku: l.variant.sku,
                  unitType: l.variant.unitType,
                  unitQuantity: l.variant.unitQuantity,
                  hsnCode: l.product.hsnCode,
                  quantity: l.quantity,
                  unitPrice: l.unitPrice,
                  mrp: l.variant.mrp,
                  taxInclusive: l.price!.taxInclusive,
                  taxRateBps: l.product.taxRateBps,
                  lineAmount: t.lineAmount,
                  discount: t.discount,
                  netAmount: t.netAmount,
                  taxableValue: t.taxableValue,
                  taxAmount: t.tax,
                  requiresPrescription: l.product.requiresPrescription,
                  substitutionPref: l.substitutionPref,
                };
              }),
            },
            events: { create: { toStatus: status, actorUserId: userId, actorType: 'CUSTOMER', note: 'Order created' } },
          },
        });

        if (quote.coupon) {
          await tx.couponRedemption.create({ data: { couponId: quote.coupon.id, userId, orderId: created.id, amount: totals.discount } });
        }
        if (method === 'COD' || method === 'BUSINESS_CREDIT') {
          await tx.payment.create({
            data: {
              orderId: created.id,
              method,
              provider: method === 'COD' ? 'cod' : 'credit',
              amount: totals.grandTotal,
              idempotencyKey: `${created.id}:${method}`,
              transactions:
                method === 'BUSINESS_CREDIT'
                  ? { create: { type: 'CREDIT_SALE', amount: totals.grandTotal, status: 'RECORDED' } }
                  : undefined,
            },
          });
        }
        await tx.cart.delete({ where: { id: quote.cart!.id } });
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15_000 },
    );

    await notify(userId, {
      type: 'ORDER_UPDATE',
      title: `Order ${order.orderNumber}: ${ORDER_STATUS_LABELS[order.status]}`,
      body: status === 'PENDING_PAYMENT' ? 'Complete payment to confirm your order.' : status === 'AWAITING_RX_REVIEW' ? 'A pharmacist will review your prescription.' : 'The store will confirm your order shortly.',
      data: { orderId: order.id },
    });
    if (status === 'PLACED' || status === 'AWAITING_RX_REVIEW') {
      await notify(await sellerUserIds(order.storeId), { type: 'NEW_ORDER', title: `New order ${order.orderNumber}`, body: 'Review and accept the order.', data: { orderId: order.id } });
    }
    return { order, replayed: false };
  } catch (err) {
    // Two identical requests racing: the loser hits the unique index and returns the winner's order.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.order.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey: input.idempotencyKey } } });
      if (winner) return { order: winner, replayed: true };
    }
    throw err;
  }
}

export interface TransitionArgs {
  orderId: string;
  to: OrderStatus;
  actor: OrderActor;
  actorUserId: string | null;
  note?: string | null;
}

/**
 * The single path through which fulfilment status changes. Enforces the state machine, uses an
 * optimistic status check to avoid lost updates, and applies side effects (stock, refunds, payouts).
 */
export async function transitionOrder(args: TransitionArgs, tx?: Tx): Promise<Order> {
  const run = async (t: Tx) => {
    const order = await t.order.findUnique({ where: { id: args.orderId }, include: { items: true, payments: true } });
    if (!order) throw notFound('Order');
    const from = order.status as OrderStatus;
    if (args.actor === 'CUSTOMER' && args.to === 'CANCELLED') {
      const { customerCancellableStatuses } = await getSettings();
      if (!customerCancellableStatuses.includes(from)) throw conflict('NOT_CANCELLABLE', 'This order can no longer be cancelled. Please contact support.');
    }
    if (!canTransition(from, args.to, args.actor, { fulfilmentType: order.fulfilmentType })) {
      throw conflict('INVALID_TRANSITION', `Cannot change order from "${ORDER_STATUS_LABELS[from]}" to "${ORDER_STATUS_LABELS[args.to]}"`);
    }

    const data: Prisma.OrderUpdateManyMutationInput = { status: args.to };
    const releasing = (args.to === 'CANCELLED' || args.to === 'REJECTED') && STOCK_HOLDING_STATUSES.includes(from);
    if (args.to === 'CANCELLED') data.cancelReason = args.note ?? null;
    if (args.to === 'REJECTED') data.rejectReason = args.note ?? null;
    if (args.to === 'DELIVERED') data.deliveredAt = new Date();

    if (releasing) {
      data.paymentStatus = await releasePayment(t, order);
      data.deliveryOtp = null;
    }
    if (args.to === 'DELIVERED' && order.paymentStatus === 'COD_PENDING') data.paymentStatus = 'COD_COLLECTED';

    const updated = await t.order.updateMany({ where: { id: order.id, status: from }, data });
    if (updated.count !== 1) throw conflict('CONCURRENT_UPDATE', 'The order was updated by someone else. Refresh and try again.');

    await t.orderStatusEvent.create({
      data: { orderId: order.id, fromStatus: from, toStatus: args.to, actorUserId: args.actorUserId, actorType: args.actor, note: args.note ?? null },
    });

    if (releasing) {
      for (const item of order.items) {
        await adjustStock(t, { storeId: order.storeId, variantId: item.variantId, delta: item.quantity, reason: 'ORDER_RELEASED', actorUserId: args.actorUserId, orderId: order.id });
      }
      // A cancelled order should not consume a coupon or credit.
      await t.couponRedemption.deleteMany({ where: { orderId: order.id } });
      if (order.paymentMethod === 'BUSINESS_CREDIT') {
        const bp = await t.businessProfile.findFirst({ where: { userId: order.userId } });
        if (bp) await t.businessProfile.update({ where: { id: bp.id }, data: { creditUsed: Math.max(0, bp.creditUsed - order.grandTotal) } });
      }
      await t.deliveryAssignment.updateMany({ where: { orderId: order.id, status: { in: ['ASSIGNED', 'ACCEPTED', 'PICKED_UP'] } }, data: { status: 'CANCELLED' } });
    }

    if (args.to === 'DELIVERED') {
      const store = await t.store.findUniqueOrThrow({ where: { id: order.storeId } });
      const saleAmount = order.itemsSubtotal - order.sellerFundedDiscount;
      await t.commissionEntry.create({
        data: {
          orderId: order.id,
          sellerOrgId: store.sellerOrgId,
          saleAmount,
          commissionRateBps: order.commissionRateBps,
          commissionAmount: order.commissionAmount,
          sellerEarning: saleAmount - order.commissionAmount,
        },
      });
      if (order.paymentMethod === 'COD') {
        const p = order.payments.find((x) => x.provider === 'cod');
        if (p) {
          await t.payment.update({ where: { id: p.id }, data: { status: 'SUCCEEDED' } });
          await t.paymentTransaction.create({ data: { paymentId: p.id, type: 'COD_COLLECTION', amount: order.grandTotal, status: 'COLLECTED' } });
        }
      }
    }
    return t.order.findUniqueOrThrow({ where: { id: order.id } });
  };

  const result = tx ? await run(tx) : await prisma.$transaction(run, { timeout: 15_000 });
  if (!tx) await afterTransition(result, args);
  return result;
}

/** Decide the payment status when an order is cancelled or rejected, creating a refund when money was taken. */
async function releasePayment(t: Tx, order: Order & { payments: { id: string; status: string; provider: string; providerRef: string | null }[] }): Promise<PaymentStatus> {
  if (order.paymentStatus === 'PAID') {
    const paid = order.payments.find((p) => p.status === 'SUCCEEDED' && p.provider !== 'cod' && p.provider !== 'credit');
    const refund = await t.refund.create({ data: { orderId: order.id, amount: order.grandTotal, reason: 'Order cancelled or rejected', status: 'PENDING' } });
    if (paid && payments.simulated) {
      // The mock gateway refunds instantly; a real gateway confirms asynchronously via webhook.
      const r = await payments.refund({ providerRef: paid.providerRef ?? paid.id, amount: order.grandTotal });
      await t.paymentTransaction.create({ data: { paymentId: paid.id, type: 'REFUND', amount: order.grandTotal, status: 'PROCESSED', providerTxnId: r.providerTxnId } });
      await t.refund.update({ where: { id: refund.id }, data: { status: 'PROCESSED', processedAt: new Date() } });
      return 'REFUNDED';
    }
    return 'REFUND_PENDING';
  }
  if (order.paymentStatus === 'PENDING' || order.paymentStatus === 'FAILED') {
    await t.payment.updateMany({ where: { orderId: order.id, status: 'CREATED' }, data: { status: 'CANCELLED' } });
  }
  return 'VOID';
}

async function afterTransition(order: Order, args: TransitionArgs) {
  try {
    const title = `Order ${order.orderNumber}: ${ORDER_STATUS_LABELS[order.status as OrderStatus]}`;
    const body =
      order.status === 'DELIVERED'
        ? 'Thank you for ordering. Rate your experience from the order page.'
        : order.status === 'CANCELLED' || order.status === 'REJECTED'
          ? `Reason: ${args.note ?? 'not specified'}. Any amount paid online will be refunded.`
          : order.status === 'PENDING_PAYMENT'
            ? 'Your prescription was approved. Complete payment to confirm the order.'
            : 'Track your order for live updates.';
    if (args.actor !== 'CUSTOMER') await notify(order.userId, { type: 'ORDER_UPDATE', title, body, data: { orderId: order.id } });
    if (args.actor === 'CUSTOMER' || args.actor === 'SYSTEM') {
      if (order.status === 'PLACED' || order.status === 'CANCELLED') {
        await notify(await sellerUserIds(order.storeId), { type: 'ORDER_UPDATE', title, body: order.status === 'PLACED' ? 'Review and accept the order.' : 'The customer cancelled this order.', data: { orderId: order.id } });
      }
    }
  } catch (err) {
    logger.warn({ err }, 'notification after transition failed');
  }
}

/** Marks a payment attempt as succeeded or failed. Idempotent: replays are ignored. */
export async function completePayment(paymentId: string, outcome: 'success' | 'failure', providerTxnId?: string, raw?: unknown) {
  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
    if (!payment) throw notFound('Payment');
    if (payment.status !== 'CREATED') return { order: payment.order, changed: false };
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: 'CREATED' },
      data: { status: outcome === 'success' ? 'SUCCEEDED' : 'FAILED', failureReason: outcome === 'failure' ? 'Payment declined (simulated)' : null },
    });
    if (claimed.count !== 1) return { order: payment.order, changed: false };
    await tx.paymentTransaction.create({
      data: {
        paymentId: payment.id,
        type: 'CHARGE',
        amount: payment.amount,
        status: outcome === 'success' ? 'CAPTURED' : 'FAILED',
        providerTxnId: providerTxnId ?? null,
        raw: (raw ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    if (outcome === 'failure') {
      const order = await tx.order.update({ where: { id: payment.orderId }, data: { paymentStatus: 'FAILED' } });
      return { order, changed: true };
    }
    if (payment.order.status !== 'PENDING_PAYMENT') {
      // Paid after the order was cancelled (e.g. timeout): record the payment and refund it.
      await tx.order.update({ where: { id: payment.orderId }, data: { paymentStatus: 'PAID' } });
      const fresh = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId }, include: { payments: true } });
      const ps = await releasePayment(tx, fresh);
      const order = await tx.order.update({ where: { id: payment.orderId }, data: { paymentStatus: ps } });
      return { order, changed: true };
    }
    await tx.order.update({ where: { id: payment.orderId }, data: { paymentStatus: 'PAID' } });
    const order = await transitionOrder({ orderId: payment.orderId, to: 'PLACED', actor: 'SYSTEM', actorUserId: null, note: 'Payment received' }, tx);
    return { order, changed: true };
  });
  if (result.changed && result.order.status === 'PLACED') {
    await afterTransition(result.order, { orderId: result.order.id, to: 'PLACED', actor: 'SYSTEM', actorUserId: null });
  }
  return result.order;
}

/** Creates (or returns the existing) payment attempt for an order awaiting online payment. */
export async function initiatePayment(userId: string, orderId: string, method: PaymentMethod, idempotencyKey: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== userId) throw notFound('Order');
  if (order.status !== 'PENDING_PAYMENT') throw conflict('PAYMENT_NOT_REQUIRED', 'This order is not awaiting payment');
  if (!ONLINE_PAYMENT_METHODS.includes(method)) throw new AppError(400, 'PAYMENT_METHOD_INVALID', 'Choose UPI, card or net banking');

  const key = `${order.id}:${idempotencyKey}`;
  const existing = await prisma.payment.findUnique({ where: { idempotencyKey: key } });
  if (existing) {
    return { payment: existing, clientPayload: { checkoutPath: `/pay/${existing.id}` }, simulated: payments.simulated };
  }
  const payment = await prisma.payment.create({
    data: { orderId: order.id, method, provider: payments.name, amount: order.grandTotal, idempotencyKey: key },
  });
  const created = await payments.createPayment({ paymentId: payment.id, amount: payment.amount, orderNumber: order.orderNumber });
  const withRef = await prisma.payment.update({ where: { id: payment.id }, data: { providerRef: created.providerRef } });
  if (order.paymentStatus === 'FAILED') await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: 'PENDING', paymentMethod: method } });
  else if (order.paymentMethod !== method) await prisma.order.update({ where: { id: order.id }, data: { paymentMethod: method } });
  return { payment: withRef, clientPayload: created.clientPayload, simulated: payments.simulated };
}

/** Cancels orders whose online payment was never completed. Run periodically. */
export async function expireUnpaidOrders() {
  const { pendingPaymentTimeoutMins } = await getSettings();
  const cutoff = new Date(Date.now() - pendingPaymentTimeoutMins * 60_000);
  const stale = await prisma.order.findMany({ where: { status: 'PENDING_PAYMENT', updatedAt: { lt: cutoff } }, select: { id: true } });
  for (const o of stale) {
    try {
      await transitionOrder({ orderId: o.id, to: 'CANCELLED', actor: 'SYSTEM', actorUserId: null, note: 'Payment not completed in time' });
    } catch (err) {
      logger.warn({ err, orderId: o.id }, 'could not expire unpaid order');
    }
  }
  return stale.length;
}

export function assertOrderOwner(order: Order | null, userId: string): asserts order is Order {
  if (!order) throw notFound('Order');
  if (order.userId !== userId) throw notFound('Order');
}

export { forbidden };
