import { nextStatusesFor, splitGst, type OrderActor, type OrderStatus } from '@padosi/shared';
import { prisma } from '../lib/prisma';
import { getSettings } from '../lib/settings';

export const orderInclude = {
  items: { include: { variant: { select: { productId: true } } } },
  events: { orderBy: { createdAt: 'asc' as const } },
  payments: { orderBy: { createdAt: 'desc' as const } },
  refunds: true,
  returnRequests: true,
  reviews: true,
  store: { include: { locality: { include: { city: true } }, sellerOrg: { select: { name: true, legalName: true, gstin: true } } } },
  delivery: {
    orderBy: { assignedAt: 'desc' as const },
    include: { deliveryPartner: { include: { user: { select: { name: true } } } }, events: { orderBy: { createdAt: 'asc' as const } } },
  },
  prescription: { select: { id: true, status: true, patientName: true, createdAt: true } },
};

type FullOrder = NonNullable<Awaited<ReturnType<typeof loadFullOrder>>>;

export function loadFullOrder(id: string) {
  return prisma.order.findUnique({ where: { id }, include: orderInclude });
}

/** Order as seen by a given role. Customers see their delivery code; sellers and riders do not. */
export async function orderView(order: FullOrder, viewer: OrderActor) {
  const settings = await getSettings();
  const status = order.status as OrderStatus;
  const activeDelivery = order.delivery.find((d) => d.status !== 'CANCELLED') ?? null;
  const returnWindowOpen = order.deliveredAt ? Date.now() - order.deliveredAt.getTime() < settings.returnWindowHours * 3600_000 : false;
  const addr = order.deliveryAddress as Record<string, unknown> | null;
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    fulfilmentType: order.fulfilmentType,
    channel: order.channel,
    vertical: order.vertical,
    placedAt: order.placedAt,
    deliveredAt: order.deliveredAt,
    scheduledFor: order.scheduledFor,
    etaMinMins: order.etaMinMins,
    etaMaxMins: order.etaMaxMins,
    distanceKm: order.distanceKm,
    notes: order.notes,
    cancelReason: order.cancelReason,
    rejectReason: order.rejectReason,
    couponCode: order.couponCode,
    buyerGstin: order.buyerGstin,
    buyerBusinessName: order.buyerBusinessName,
    deliveryAddress:
      viewer === 'SELLER' && addr ? { contactName: addr.contactName, locality: addr.locality, city: addr.city, postalCode: addr.postalCode } : addr,
    deliveryOtp: viewer === 'CUSTOMER' && !['DELIVERED', 'CANCELLED', 'REJECTED'].includes(status) ? order.deliveryOtp : undefined,
    totals: {
      itemsSubtotal: order.itemsSubtotal,
      mrpTotal: order.mrpTotal,
      discount: order.discountTotal,
      deliveryFee: order.deliveryFee,
      taxableValue: order.taxableValue,
      taxTotal: order.taxTotal,
      grandTotal: order.grandTotal,
      ...(viewer === 'SELLER' || viewer === 'ADMIN'
        ? { commissionRateBps: order.commissionRateBps, commissionAmount: order.commissionAmount, sellerEarning: order.itemsSubtotal - order.sellerFundedDiscount - order.commissionAmount }
        : {}),
    },
    items: order.items.map((i) => ({
      id: i.id,
      variantId: i.variantId,
      productId: i.variant.productId,
      productName: i.productName,
      variantName: i.variantName,
      sku: i.sku,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      mrp: i.mrp,
      lineAmount: i.lineAmount,
      discount: i.discount,
      netAmount: i.netAmount,
      taxRateBps: i.taxRateBps,
      taxAmount: i.taxAmount,
      requiresPrescription: i.requiresPrescription,
      substitutionPref: i.substitutionPref,
      returnedQty: i.returnedQty,
    })),
    events: order.events.map((e) => ({ toStatus: e.toStatus, fromStatus: e.fromStatus, actorType: e.actorType, note: e.note, at: e.createdAt })),
    store: { id: order.store.id, name: order.store.name, slug: order.store.slug, phone: order.store.phone, addressLine: order.store.addressLine, isDemo: order.store.isDemo },
    delivery: activeDelivery
      ? {
          id: activeDelivery.id,
          status: activeDelivery.status,
          partnerName: activeDelivery.deliveryPartner.user.name.split(' ')[0],
          vehicleType: activeDelivery.deliveryPartner.vehicleType,
          assignedAt: activeDelivery.assignedAt,
          pickedUpAt: activeDelivery.pickedUpAt,
          events: activeDelivery.events.map((e) => ({ status: e.status, issueType: e.issueType, note: e.note, at: e.createdAt })),
        }
      : null,
    payments: order.payments.map((p) => ({ id: p.id, method: p.method, provider: p.provider, status: p.status, amount: p.amount, failureReason: p.failureReason, createdAt: p.createdAt })),
    refunds: order.refunds.map((r) => ({ id: r.id, amount: r.amount, status: r.status, reason: r.reason, processedAt: r.processedAt })),
    returns: order.returnRequests.map((r) => ({ id: r.id, status: r.status, reason: r.reason, amount: r.amount, resolutionNote: r.resolutionNote, createdAt: r.createdAt })),
    prescription: order.prescription,
    review: order.reviews[0] ? { rating: order.reviews[0].rating, comment: order.reviews[0].comment } : null,
    actions: {
      canCancel: viewer === 'CUSTOMER' && settings.customerCancellableStatuses.includes(status) && nextStatusesFor(status, 'CUSTOMER').includes('CANCELLED'),
      canPay: viewer === 'CUSTOMER' && status === 'PENDING_PAYMENT',
      canReview: viewer === 'CUSTOMER' && status === 'DELIVERED' && order.reviews.length === 0,
      canReturn: viewer === 'CUSTOMER' && status === 'DELIVERED' && returnWindowOpen && !order.returnRequests.some((r) => r.status === 'REQUESTED' || r.status === 'APPROVED'),
      nextStatuses: viewer === 'CUSTOMER' ? [] : nextStatusesFor(status, viewer, { fulfilmentType: order.fulfilmentType }),
    },
  };
}

/** GST invoice data. Marketplace model: the seller is the supplier and issues the invoice. */
export function invoiceView(order: FullOrder) {
  const addr = order.deliveryAddress as Record<string, string> | null;
  const isTaxInvoice = order.status === 'DELIVERED';
  const lines = order.items.map((i) => {
    const gst = splitGst(i.taxAmount, order.intraState);
    return {
      description: `${i.productName} (${i.variantName})`,
      sku: i.sku,
      hsn: i.hsnCode,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      discount: i.discount,
      taxableValue: i.taxableValue,
      gstRateBps: i.taxRateBps,
      ...gst,
      total: i.netAmount,
    };
  });
  const sum = (k: 'cgst' | 'sgst' | 'igst' | 'taxableValue') => lines.reduce((s, l) => s + l[k], 0);
  return {
    documentType: isTaxInvoice ? 'TAX_INVOICE' : 'ORDER_SUMMARY',
    invoiceNumber: isTaxInvoice ? `INV-${order.orderNumber.slice(3)}` : null,
    orderNumber: order.orderNumber,
    date: order.deliveredAt ?? order.placedAt,
    isDemo: order.store.isDemo,
    supplier: {
      name: order.store.name,
      legalName: order.store.sellerOrg.legalName,
      gstin: order.store.sellerOrg.gstin,
      address: `${order.store.addressLine}, ${order.store.locality.name}, ${order.store.locality.city.name}, ${order.store.locality.city.state} ${order.store.postalCode}`,
      stateCode: order.store.locality.city.stateCode,
    },
    buyer: {
      name: order.buyerBusinessName ?? addr?.contactName ?? null,
      gstin: order.buyerGstin,
      address: addr ? [addr.line1, addr.line2, addr.locality, addr.city, addr.state, addr.postalCode].filter(Boolean).join(', ') : 'Store pickup',
    },
    placeOfSupply: addr?.state ?? order.store.locality.city.state,
    intraState: order.intraState,
    lines,
    totals: {
      taxableValue: sum('taxableValue'),
      cgst: sum('cgst'),
      sgst: sum('sgst'),
      igst: sum('igst'),
      itemsTotal: order.itemsSubtotal - order.discountTotal,
      deliveryFee: order.deliveryFee,
      grandTotal: order.grandTotal,
    },
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
  };
}
