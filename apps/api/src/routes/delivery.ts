import { Router } from 'express';
import { z } from 'zod';
import { deliveryPartnerRegisterSchema, deliveryStatusSchema, maskPhone } from '@padosi/shared';
import { prisma } from '../lib/prisma';
import { AppError, conflict, forbidden, notFound, parse } from '../lib/errors';
import { authOf, requireAuth } from '../middleware/auth';
import { transitionOrder } from '../services/orders';
import { notify, sellerUserIds } from '../providers/notifications';
import { audit } from '../lib/audit';

export const deliveryRouter = Router();
deliveryRouter.use(requireAuth);

async function myPartner(userId: string) {
  const p = await prisma.deliveryPartner.findUnique({ where: { userId } });
  if (!p) throw new AppError(404, 'NOT_A_PARTNER', 'Register as a delivery partner first');
  return p;
}

deliveryRouter.post('/register', async (req, res) => {
  const input = parse(deliveryPartnerRegisterSchema, req.body);
  const userId = authOf(req).user.id;
  if (await prisma.deliveryPartner.findUnique({ where: { userId } })) throw conflict('EXISTS', 'You are already registered');
  const partner = await prisma.$transaction(async (tx) => {
    const p = await tx.deliveryPartner.create({ data: { userId, ...input } });
    await tx.userRole.upsert({ where: { userId_role: { userId, role: 'DELIVERY_PARTNER' } }, create: { userId, role: 'DELIVERY_PARTNER' }, update: {} });
    return p;
  });
  await audit(req, 'DELIVERY_PARTNER_REGISTERED', 'DeliveryPartner', partner.id);
  res.status(201).json({ partner });
});

deliveryRouter.get('/me', async (req, res) => {
  const p = await prisma.deliveryPartner.findUnique({ where: { userId: authOf(req).user.id }, include: { city: { select: { name: true } } } });
  res.json({ partner: p });
});

deliveryRouter.post('/availability', async (req, res) => {
  const input = parse(z.object({ isOnline: z.boolean(), lat: z.number().optional(), lng: z.number().optional() }), req.body);
  const p = await myPartner(authOf(req).user.id);
  if (input.isOnline && p.verificationStatus !== 'APPROVED') throw forbidden('Your account must be verified before going online');
  const updated = await prisma.deliveryPartner.update({
    where: { id: p.id },
    data: { isOnline: input.isOnline, lastLat: input.lat, lastLng: input.lng, lastSeenAt: new Date() },
  });
  res.json({ partner: updated });
});

/**
 * Riders see the minimum customer data needed: only the locality before pickup, the full address and
 * phone while carrying the order, and nothing personal after the delivery is closed.
 */
function assignmentView(a: Awaited<ReturnType<typeof loadAssignments>>[number]) {
  const addr = a.order.deliveryAddress as Record<string, string | number> | null;
  const carrying = a.status === 'PICKED_UP';
  const active = ['ASSIGNED', 'ACCEPTED', 'PICKED_UP'].includes(a.status);
  return {
    id: a.id,
    status: a.status,
    assignedAt: a.assignedAt,
    pickedUpAt: a.pickedUpAt,
    completedAt: a.completedAt,
    earning: a.earningAmount,
    order: {
      id: a.order.id,
      orderNumber: a.order.orderNumber,
      status: a.order.status,
      itemCount: a.order._count.items,
      distanceKm: a.order.distanceKm,
      collectCash: a.order.paymentMethod === 'COD' && a.order.paymentStatus === 'COD_PENDING' ? a.order.grandTotal : 0,
    },
    store: active ? { name: a.order.store.name, addressLine: a.order.store.addressLine, phone: a.order.store.phone, lat: a.order.store.lat, lng: a.order.store.lng } : { name: a.order.store.name },
    customer: addr
      ? carrying
        ? { name: addr.contactName, phone: addr.contactPhone, address: [addr.line1, addr.line2, addr.landmark, addr.locality].filter(Boolean).join(', '), lat: addr.lat, lng: addr.lng }
        : { name: active ? String(addr.contactName).split(' ')[0] : null, phone: active ? maskPhone(String(addr.contactPhone)) : null, address: String(addr.locality), lat: null, lng: null }
      : null,
    events: a.events.map((e) => ({ status: e.status, issueType: e.issueType, note: e.note, at: e.createdAt })),
  };
}

function loadAssignments(partnerId: string, active: boolean) {
  return prisma.deliveryAssignment.findMany({
    where: { deliveryPartnerId: partnerId, status: active ? { in: ['ASSIGNED', 'ACCEPTED', 'PICKED_UP'] } : { in: ['DELIVERED', 'FAILED', 'CANCELLED'] } },
    orderBy: { assignedAt: 'desc' },
    take: active ? 20 : 50,
    include: { order: { include: { store: true, _count: { select: { items: true } } } }, events: { orderBy: { createdAt: 'asc' } } },
  });
}

deliveryRouter.get('/assignments', async (req, res) => {
  const { scope } = parse(z.object({ scope: z.enum(['active', 'history']).default('active') }), req.query);
  const p = await myPartner(authOf(req).user.id);
  const list = await loadAssignments(p.id, scope === 'active');
  res.json({ assignments: list.map(assignmentView) });
});

deliveryRouter.post('/assignments/:id/status', async (req, res) => {
  const input = parse(deliveryStatusSchema, req.body);
  const userId = authOf(req).user.id;
  const p = await myPartner(userId);
  const a = await prisma.deliveryAssignment.findUnique({ where: { id: String(req.params.id) }, include: { order: true, events: true } });
  if (!a || a.deliveryPartnerId !== p.id) throw notFound('Assignment');
  const event = (status: string, extra: Partial<{ issueType: string; note: string }> = {}) =>
    prisma.deliveryTrackingEvent.create({ data: { assignmentId: a.id, status, lat: input.lat, lng: input.lng, ...extra } });

  switch (input.status) {
    case 'ACCEPTED': {
      if (a.status !== 'ASSIGNED') throw conflict('INVALID_STATE', 'Already acknowledged');
      await prisma.deliveryAssignment.update({ where: { id: a.id }, data: { status: 'ACCEPTED', acceptedAt: new Date() } });
      await event('ACCEPTED');
      break;
    }
    case 'PICKED_UP': {
      if (!['ASSIGNED', 'ACCEPTED'].includes(a.status)) throw conflict('INVALID_STATE', 'This delivery cannot be picked up now');
      if (!['READY_FOR_PICKUP', 'DELIVERY_FAILED'].includes(a.order.status)) throw conflict('NOT_READY', 'The store has not marked this order ready yet');
      await transitionOrder({ orderId: a.orderId, to: 'OUT_FOR_DELIVERY', actor: 'DELIVERY', actorUserId: userId, note: 'Picked up from store' });
      await prisma.deliveryAssignment.update({ where: { id: a.id }, data: { status: 'PICKED_UP', pickedUpAt: new Date(), acceptedAt: a.acceptedAt ?? new Date() } });
      await event('PICKED_UP');
      break;
    }
    case 'DELIVERED': {
      if (a.status !== 'PICKED_UP') throw conflict('INVALID_STATE', 'Pick up the order before completing delivery');
      const failures = a.events.filter((e) => e.status === 'OTP_FAILED').length;
      if (failures >= 5) throw forbidden('Too many incorrect codes. Contact support to complete this delivery.');
      if (!input.otp || input.otp !== a.order.deliveryOtp) {
        await event('OTP_FAILED');
        throw new AppError(400, 'OTP_INVALID', 'Incorrect delivery code. Ask the customer for the 4-digit code shown in their app.');
      }
      await transitionOrder({ orderId: a.orderId, to: 'DELIVERED', actor: 'DELIVERY', actorUserId: userId, note: 'Delivered with customer code' });
      await prisma.deliveryAssignment.update({ where: { id: a.id }, data: { status: 'DELIVERED', completedAt: new Date() } });
      await event('DELIVERED');
      break;
    }
    case 'FAILED': {
      if (!input.issueType) throw new AppError(400, 'VALIDATION_ERROR', 'Choose what went wrong', { fields: { issueType: 'Required' } });
      if (a.status === 'PICKED_UP') {
        await transitionOrder({ orderId: a.orderId, to: 'DELIVERY_FAILED', actor: 'DELIVERY', actorUserId: userId, note: `${input.issueType}${input.note ? `: ${input.note}` : ''}` });
        await prisma.deliveryAssignment.update({ where: { id: a.id }, data: { status: 'FAILED', completedAt: new Date() } });
      } else if (['ASSIGNED', 'ACCEPTED'].includes(a.status)) {
        // Rider cannot take the job before pickup: release it so the store can reassign.
        await prisma.deliveryAssignment.update({ where: { id: a.id }, data: { status: 'CANCELLED', completedAt: new Date() } });
      } else throw conflict('INVALID_STATE', 'This delivery is already closed');
      await event('ISSUE_REPORTED', { issueType: input.issueType, note: input.note });
      await notify(await sellerUserIds(a.order.storeId), { type: 'DELIVERY_ISSUE', title: `Delivery issue on ${a.order.orderNumber}`, body: `${input.issueType.replace(/_/g, ' ').toLowerCase()}${input.note ? ` – ${input.note}` : ''}. Reassign if needed.`, data: { orderId: a.orderId } });
      break;
    }
  }
  const fresh = await loadAssignments(p.id, true);
  const history = fresh.find((x) => x.id === a.id) ?? (await loadAssignments(p.id, false)).find((x) => x.id === a.id);
  res.json({ assignment: history ? assignmentView(history) : null });
});

deliveryRouter.get('/earnings', async (req, res) => {
  const p = await myPartner(authOf(req).user.id);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const [todayAgg, weekAgg, total, failed] = await Promise.all([
    prisma.deliveryAssignment.aggregate({ where: { deliveryPartnerId: p.id, status: 'DELIVERED', completedAt: { gte: today } }, _sum: { earningAmount: true }, _count: true }),
    prisma.deliveryAssignment.aggregate({ where: { deliveryPartnerId: p.id, status: 'DELIVERED', completedAt: { gte: weekAgo } }, _sum: { earningAmount: true }, _count: true }),
    prisma.deliveryAssignment.aggregate({ where: { deliveryPartnerId: p.id, status: 'DELIVERED' }, _sum: { earningAmount: true }, _count: true }),
    prisma.deliveryAssignment.count({ where: { deliveryPartnerId: p.id, status: 'FAILED' } }),
  ]);
  res.json({
    today: { deliveries: todayAgg._count, earnings: todayAgg._sum.earningAmount ?? 0 },
    last7Days: { deliveries: weekAgg._count, earnings: weekAgg._sum.earningAmount ?? 0 },
    allTime: { deliveries: total._count, earnings: total._sum.earningAmount ?? 0, failed },
    note: 'Earnings are estimates from the configured payout rule; payouts are not processed in this MVP.',
  });
});
