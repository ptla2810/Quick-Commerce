import { prisma } from '../lib/prisma';
import { conflict, notFound } from '../lib/errors';
import { getSettings } from '../lib/settings';
import { notify } from '../providers/notifications';

const ASSIGNABLE = ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'DELIVERY_FAILED'];

/**
 * Manual dispatch for the MVP: a seller or admin picks an approved, online partner in the same city.
 * Automated dispatch (nearest available partner, load balancing) is future work.
 */
export async function assignDelivery(orderId: string, deliveryPartnerId: string, assignedByUserId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { store: { include: { locality: true } } } });
  if (!order) throw notFound('Order');
  if (order.fulfilmentType !== 'DELIVERY') throw conflict('PICKUP_ORDER', 'This is a store-pickup order');
  if (!ASSIGNABLE.includes(order.status)) throw conflict('NOT_ASSIGNABLE', 'Delivery can be assigned once the store accepts the order');
  const partner = await prisma.deliveryPartner.findUnique({ where: { id: deliveryPartnerId }, include: { user: true } });
  if (!partner || partner.verificationStatus !== 'APPROVED' || partner.user.status !== 'ACTIVE') throw notFound('Verified delivery partner');
  if (partner.cityId !== order.store.locality.cityId) throw conflict('WRONG_CITY', 'This delivery partner works in a different city');
  if (!partner.isOnline) throw conflict('PARTNER_OFFLINE', 'This delivery partner is offline');

  const { deliveryPartnerPayout } = await getSettings();
  const earning = deliveryPartnerPayout.basePerDelivery + Math.ceil(order.distanceKm ?? 0) * deliveryPartnerPayout.perKm;

  const assignment = await prisma.$transaction(async (tx) => {
    await tx.deliveryAssignment.updateMany({ where: { orderId, status: { in: ['ASSIGNED', 'ACCEPTED'] } }, data: { status: 'CANCELLED' } });
    const a = await tx.deliveryAssignment.create({
      data: { orderId, deliveryPartnerId, assignedByUserId, earningAmount: earning, events: { create: { status: 'ASSIGNED' } } },
    });
    return a;
  });
  await notify(partner.userId, { type: 'DELIVERY_ASSIGNED', title: `New delivery: ${order.orderNumber}`, body: `Pick up from ${order.store.name}`, data: { assignmentId: assignment.id } });
  return assignment;
}

export async function availablePartners(cityId: string) {
  const partners = await prisma.deliveryPartner.findMany({
    where: { cityId, verificationStatus: 'APPROVED', isOnline: true, user: { status: 'ACTIVE' } },
    include: { user: { select: { name: true } }, _count: { select: { assignments: { where: { status: { in: ['ASSIGNED', 'ACCEPTED', 'PICKED_UP'] } } } } } },
  });
  return partners.map((p) => ({ id: p.id, name: p.user.name, vehicleType: p.vehicleType, activeDeliveries: p._count.assignments }));
}
