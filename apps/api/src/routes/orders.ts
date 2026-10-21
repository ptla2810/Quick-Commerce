import { Router } from 'express';
import { z } from 'zod';
import { cancelOrderSchema, PAYMENT_METHODS, placeOrderSchema, returnRequestSchema, reviewSchema } from '@padosi/shared';
import { prisma, Prisma } from '../lib/prisma';
import { AppError, conflict, forbidden, notFound, parse } from '../lib/errors';
import { authOf, requireAuth } from '../middleware/auth';
import { writeLimiter } from '../middleware/rateLimit';
import { completePayment, initiatePayment, placeOrder, transitionOrder } from '../services/orders';
import { invoiceView, loadFullOrder, orderView } from '../services/orderViews';
import { getSettings } from '../lib/settings';
import { payments } from '../providers/payments';
import { demoMode } from '../config/env';
import { approvedBusinessProfileId, resolvePrices } from '../services/pricing';
import { notify, sellerUserIds } from '../providers/notifications';

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

async function ownOrder(userId: string, id: string) {
  const order = await loadFullOrder(id);
  if (!order || order.userId !== userId) throw notFound('Order');
  return order;
}

ordersRouter.post('/', writeLimiter, async (req, res) => {
  const headerKey = req.header('Idempotency-Key');
  const input = parse(placeOrderSchema, { ...req.body, idempotencyKey: req.body?.idempotencyKey ?? headerKey });
  const userId = authOf(req).user.id;
  const { order, replayed } = await placeOrder(userId, input);
  const full = await loadFullOrder(order.id);
  res.status(replayed ? 200 : 201).json({ order: await orderView(full!, 'CUSTOMER'), replayed });
});

ordersRouter.get('/', async (req, res) => {
  const q = parse(
    z.object({ scope: z.enum(['all', 'active', 'past']).default('all'), channel: z.enum(['RETAIL', 'BUSINESS']).optional(), page: z.coerce.number().int().min(1).default(1) }),
    req.query,
  );
  const userId = authOf(req).user.id;
  const terminal = ['DELIVERED', 'CANCELLED', 'REJECTED'] as const;
  const where: Prisma.OrderWhereInput = {
    userId,
    ...(q.channel ? { channel: q.channel } : {}),
    ...(q.scope === 'active' ? { status: { notIn: [...terminal] } } : q.scope === 'past' ? { status: { in: [...terminal] } } : {}),
  };
  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { placedAt: 'desc' },
      skip: (q.page - 1) * 20,
      take: 20,
      include: { store: { select: { name: true, slug: true } }, items: { select: { productName: true, quantity: true }, take: 4 }, _count: { select: { items: true } } },
    }),
    prisma.order.count({ where }),
  ]);
  res.json({
    total,
    page: q.page,
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      paymentStatus: o.paymentStatus,
      channel: o.channel,
      vertical: o.vertical,
      grandTotal: o.grandTotal,
      placedAt: o.placedAt,
      store: o.store,
      itemCount: o._count.items,
      preview: o.items.map((i) => `${i.productName} × ${i.quantity}`),
    })),
  });
});

ordersRouter.get('/:id', async (req, res) => {
  const order = await ownOrder(authOf(req).user.id, String(req.params.id));
  res.json({ order: await orderView(order, 'CUSTOMER') });
});

ordersRouter.post('/:id/cancel', async (req, res) => {
  const { reason } = parse(cancelOrderSchema, req.body);
  const userId = authOf(req).user.id;
  await ownOrder(userId, String(req.params.id));
  await transitionOrder({ orderId: String(req.params.id), to: 'CANCELLED', actor: 'CUSTOMER', actorUserId: userId, note: reason });
  res.json({ order: await orderView((await loadFullOrder(String(req.params.id)))!, 'CUSTOMER') });
});

ordersRouter.post('/:id/pay', writeLimiter, async (req, res) => {
  const { method } = parse(z.object({ method: z.enum(PAYMENT_METHODS) }), req.body);
  const key = req.header('Idempotency-Key') ?? req.body?.idempotencyKey;
  if (!key || String(key).length < 8) throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required');
  const r = await initiatePayment(authOf(req).user.id, String(req.params.id), method, String(key));
  res.status(201).json({ paymentId: r.payment.id, provider: r.payment.provider, simulated: r.simulated, amount: r.payment.amount, client: r.clientPayload });
});

ordersRouter.get('/:id/invoice', async (req, res) => {
  const order = await ownOrder(authOf(req).user.id, String(req.params.id));
  if (['CANCELLED', 'REJECTED', 'PENDING_PAYMENT', 'AWAITING_RX_REVIEW'].includes(order.status)) throw conflict('INVOICE_UNAVAILABLE', 'An invoice is not available for this order');
  res.json({ invoice: invoiceView(order) });
});

/** Adds still-available items from a past order back into the cart (replacing it). */
ordersRouter.post('/:id/reorder', async (req, res) => {
  const userId = authOf(req).user.id;
  const order = await ownOrder(userId, String(req.params.id));
  const channel = order.channel;
  const businessProfileId = channel === 'BUSINESS' ? await approvedBusinessProfileId(userId) : null;
  const variantIds = order.items.map((i) => i.variantId);
  const [inv, prices] = await Promise.all([
    prisma.storeInventory.findMany({ where: { storeId: order.storeId, variantId: { in: variantIds }, isAvailable: true, stockQty: { gt: 0 } }, include: { variant: { include: { product: true } } } }),
    resolvePrices([order.storeId], variantIds, { channel, businessProfileId }),
  ]);
  const ok = inv.filter((i) => prices.has(`${order.storeId}:${i.variantId}`) && i.variant.isActive && i.variant.product.isActive && !i.variant.product.isRestricted);
  if (!ok.length) throw new AppError(400, 'NOTHING_TO_REORDER', 'None of these items are available right now');
  await prisma.cart.deleteMany({ where: { userId, channel } });
  await prisma.cart.create({
    data: {
      userId,
      storeId: order.storeId,
      channel,
      items: {
        create: ok.map((i) => {
          const wanted = order.items.find((x) => x.variantId === i.variantId)!.quantity;
          return { variantId: i.variantId, quantity: Math.min(wanted, i.stockQty) };
        }),
      },
    },
  });
  res.json({ added: ok.length, skipped: order.items.length - ok.length, mode: channel });
});

ordersRouter.post('/:id/review', async (req, res) => {
  const input = parse(reviewSchema, { ...req.body, orderId: String(req.params.id) });
  const userId = authOf(req).user.id;
  const order = await ownOrder(userId, String(req.params.id));
  if (order.status !== 'DELIVERED') throw conflict('NOT_REVIEWABLE', 'You can rate an order after it is delivered');
  await prisma.$transaction(async (tx) => {
    await tx.review.create({ data: { userId, orderId: order.id, storeId: order.storeId, rating: input.rating, comment: input.comment ?? null } });
    const agg = await tx.review.aggregate({ where: { storeId: order.storeId }, _avg: { rating: true }, _count: true });
    await tx.store.update({ where: { id: order.storeId }, data: { ratingAvg: Math.round((agg._avg.rating ?? 0) * 10) / 10, ratingCount: agg._count } });
  });
  res.status(201).json({ ok: true });
});

ordersRouter.post('/:id/returns', async (req, res) => {
  const input = parse(returnRequestSchema, req.body);
  const userId = authOf(req).user.id;
  const order = await ownOrder(userId, String(req.params.id));
  const view = await orderView(order, 'CUSTOMER');
  if (!view.actions.canReturn) throw conflict('NOT_RETURNABLE', 'This order is not eligible for a return');
  let amount = 0;
  for (const r of input.items) {
    const item = order.items.find((i) => i.id === r.orderItemId);
    if (!item) throw new AppError(400, 'VALIDATION_ERROR', 'Unknown order item');
    if (r.quantity > item.quantity - item.returnedQty) throw new AppError(400, 'VALIDATION_ERROR', `You can return at most ${item.quantity - item.returnedQty} of ${item.productName}`);
    amount += Math.round((item.netAmount * r.quantity) / item.quantity);
  }
  const rr = await prisma.returnRequest.create({ data: { orderId: order.id, userId, reason: input.reason, items: input.items, amount } });
  await notify(await sellerUserIds(order.storeId), { type: 'RETURN_REQUESTED', title: `Return requested for ${order.orderNumber}`, body: input.reason, data: { orderId: order.id } });
  res.status(201).json({ returnRequest: rr });
});

export const paymentsRouter = Router();

paymentsRouter.get('/:id', requireAuth, async (req, res) => {
  const p = await prisma.payment.findUnique({ where: { id: String(req.params.id) }, include: { order: { select: { id: true, userId: true, orderNumber: true, status: true } } } });
  if (!p || p.order.userId !== authOf(req).user.id) throw notFound('Payment');
  res.json({ payment: { id: p.id, amount: p.amount, method: p.method, status: p.status, provider: p.provider, orderId: p.order.id, orderNumber: p.order.orderNumber, orderStatus: p.order.status } });
});

/** Completes a simulated payment. Only available with the mock provider outside production. */
paymentsRouter.post('/:id/mock-complete', requireAuth, async (req, res) => {
  if (!payments.simulated || !demoMode) throw forbidden('Simulated payments are disabled');
  const { outcome } = parse(z.object({ outcome: z.enum(['success', 'failure']) }), req.body);
  const p = await prisma.payment.findUnique({ where: { id: String(req.params.id) }, include: { order: true } });
  if (!p || p.order.userId !== authOf(req).user.id || p.provider !== 'mock') throw notFound('Payment');
  const order = await completePayment(p.id, outcome, `mock_txn_${Date.now()}`, { simulated: true });
  res.json({ orderId: order.id, orderStatus: order.status, paymentStatus: order.paymentStatus });
});

/** Razorpay webhook (payment.captured / payment.failed). Signature verified against the raw body. */
export async function razorpayWebhook(req: import('express').Request, res: import('express').Response) {
  const raw = req.body as Buffer;
  if (!payments.verifyWebhook(raw, req.header('x-razorpay-signature'))) throw new AppError(401, 'BAD_SIGNATURE', 'Invalid webhook signature');
  const event = JSON.parse(raw.toString('utf8')) as { event: string; payload: { payment: { entity: { id: string; order_id: string } } } };
  const entity = event.payload?.payment?.entity;
  const payment = entity ? await prisma.payment.findUnique({ where: { providerRef: entity.order_id } }) : null;
  if (payment && (event.event === 'payment.captured' || event.event === 'payment.failed')) {
    await completePayment(payment.id, event.event === 'payment.captured' ? 'success' : 'failure', entity.id, event);
  }
  res.json({ ok: true });
}

export { getSettings };
