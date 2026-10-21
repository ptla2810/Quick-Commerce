import { Router } from 'express';
import { z } from 'zod';
import { businessProfileSchema, DOCUMENT_TYPES, procurementListSchema, rfqCreateSchema } from '@padosi/shared';
import { prisma } from '../lib/prisma';
import { AppError, conflict, forbidden, notFound, parse } from '../lib/errors';
import { authOf, requireAuth } from '../middleware/auth';
import { audit } from '../lib/audit';
import { referenceNumber } from '../lib/crypto';
import { saveUpload, upload } from '../lib/upload';
import { notify, sellerUserIds } from '../providers/notifications';
import { publicStore, serviceableStores } from '../services/serviceability';
import { locationQuery } from './locations';

export const businessRouter = Router();
businessRouter.use(requireAuth);

async function myProfile(userId: string) {
  const bp = await prisma.businessProfile.findUnique({ where: { userId } });
  if (!bp) throw new AppError(404, 'NO_BUSINESS_PROFILE', 'Register your business first');
  return bp;
}

businessRouter.get('/profile', async (req, res) => {
  const bp = await prisma.businessProfile.findUnique({
    where: { userId: authOf(req).user.id },
    include: { city: { select: { name: true } }, documents: { select: { id: true, type: true, status: true, createdAt: true } } },
  });
  res.json({ profile: bp });
});

businessRouter.post('/profile', async (req, res) => {
  const input = parse(businessProfileSchema, req.body);
  const userId = authOf(req).user.id;
  if (await prisma.businessProfile.findUnique({ where: { userId } })) throw conflict('EXISTS', 'You already have a business profile');
  const bp = await prisma.$transaction(async (tx) => {
    const bp = await tx.businessProfile.create({ data: { ...input, userId, gstin: input.gstin ?? null, fssaiNumber: input.fssaiNumber ?? null } });
    await tx.userRole.upsert({ where: { userId_role: { userId, role: 'BUSINESS_BUYER' } }, create: { userId, role: 'BUSINESS_BUYER' }, update: {} });
    return bp;
  });
  await audit(req, 'BUSINESS_REGISTERED', 'BusinessProfile', bp.id);
  res.status(201).json({ profile: bp });
});

businessRouter.patch('/profile', async (req, res) => {
  const input = parse(businessProfileSchema.partial(), req.body);
  const bp = await myProfile(authOf(req).user.id);
  // Changing legal or tax identity sends the account back for verification.
  const identityChanged = (input.gstin !== undefined && input.gstin !== bp.gstin) || (input.legalName !== undefined && input.legalName !== bp.legalName);
  const updated = await prisma.businessProfile.update({
    where: { id: bp.id },
    data: { ...input, ...(identityChanged ? { verificationStatus: 'PENDING', creditApproved: false } : {}) },
  });
  res.json({ profile: updated });
});

businessRouter.post('/profile/documents', upload.single('file'), async (req, res) => {
  const { type } = parse(z.object({ type: z.enum(DOCUMENT_TYPES) }), req.body);
  const auth = authOf(req);
  const bp = await myProfile(auth.user.id);
  const file = await saveUpload(req.file, auth.user.id, 'VERIFICATION');
  const doc = await prisma.verificationDocument.create({ data: { type, fileId: file.id, businessProfileId: bp.id } });
  res.status(201).json({ document: doc });
});

businessRouter.get('/summary', async (req, res) => {
  const userId = authOf(req).user.id;
  const bp = await myProfile(userId);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const valid = { userId, channel: 'BUSINESS' as const, status: { notIn: ['CANCELLED', 'REJECTED', 'PENDING_PAYMENT'] as ('CANCELLED' | 'REJECTED' | 'PENDING_PAYMENT')[] } };
  const [month, allTime, openRfqs, topItems] = await Promise.all([
    prisma.order.aggregate({ where: { ...valid, placedAt: { gte: monthStart } }, _sum: { grandTotal: true, taxTotal: true }, _count: true }),
    prisma.order.aggregate({ where: valid, _sum: { grandTotal: true }, _count: true }),
    prisma.rfq.count({ where: { businessProfileId: bp.id, status: { in: ['OPEN', 'QUOTED'] } } }),
    prisma.orderItem.groupBy({ by: ['productName', 'variantName'], where: { order: valid }, _sum: { quantity: true, netAmount: true }, orderBy: { _sum: { netAmount: 'desc' } }, take: 5 }),
  ]);
  res.json({
    profile: { businessName: bp.businessName, verificationStatus: bp.verificationStatus, gstin: bp.gstin },
    credit: { approved: bp.creditApproved, limit: bp.creditLimit, used: bp.creditUsed, available: Math.max(0, bp.creditLimit - bp.creditUsed), days: bp.creditDays },
    thisMonth: { spend: month._sum.grandTotal ?? 0, gst: month._sum.taxTotal ?? 0, orders: month._count },
    allTime: { spend: allTime._sum.grandTotal ?? 0, orders: allTime._count },
    openRfqs,
    topItems: topItems.map((t) => ({ name: `${t.productName} (${t.variantName})`, quantity: t._sum.quantity ?? 0, spend: t._sum.netAmount ?? 0 })),
  });
});

businessRouter.get('/suppliers', async (req, res) => {
  const q = parse(locationQuery, req.query);
  const stores = await serviceableStores(q, 'HORECA');
  res.json({ stores: stores.map(publicStore) });
});

// ── Saved procurement lists / recurring templates ──
businessRouter.get('/lists', async (req, res) => {
  const bp = await myProfile(authOf(req).user.id);
  const lists = await prisma.procurementList.findMany({
    where: { businessProfileId: bp.id },
    orderBy: { updatedAt: 'desc' },
    include: { store: { select: { id: true, name: true } }, items: { include: { variant: { select: { sku: true, name: true, product: { select: { name: true } } } } } } },
  });
  res.json({ lists });
});

const nextDue = (r: string) => {
  const d = new Date();
  if (r === 'DAILY') d.setDate(d.getDate() + 1);
  else if (r === 'WEEKLY') d.setDate(d.getDate() + 7);
  else if (r === 'MONTHLY') d.setMonth(d.getMonth() + 1);
  else return null;
  return d;
};

businessRouter.post('/lists', async (req, res) => {
  const input = parse(procurementListSchema, req.body);
  const bp = await myProfile(authOf(req).user.id);
  const list = await prisma.procurementList.create({
    data: {
      businessProfileId: bp.id,
      storeId: input.storeId,
      name: input.name,
      recurrence: input.recurrence,
      nextDueAt: nextDue(input.recurrence),
      items: { create: input.items },
    },
  });
  res.status(201).json({ list });
});

/** Save the items of a past order as a procurement list ("reorder from invoice"). */
businessRouter.post('/lists/from-order/:orderId', async (req, res) => {
  const { name } = parse(z.object({ name: z.string().trim().min(1).max(80) }), req.body);
  const userId = authOf(req).user.id;
  const bp = await myProfile(userId);
  const order = await prisma.order.findFirst({ where: { id: String(req.params.orderId), userId }, include: { items: true } });
  if (!order) throw notFound('Order');
  const list = await prisma.procurementList.create({
    data: { businessProfileId: bp.id, storeId: order.storeId, name, items: { create: order.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })) } },
  });
  res.status(201).json({ list });
});

businessRouter.delete('/lists/:id', async (req, res) => {
  const bp = await myProfile(authOf(req).user.id);
  const r = await prisma.procurementList.deleteMany({ where: { id: String(req.params.id), businessProfileId: bp.id } });
  if (!r.count) throw notFound('List');
  res.json({ ok: true });
});

// ── RFQs ──
businessRouter.get('/rfqs', async (req, res) => {
  const bp = await myProfile(authOf(req).user.id);
  const rfqs = await prisma.rfq.findMany({
    where: { businessProfileId: bp.id },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { items: true, quotations: true } }, deliveryLocality: { select: { name: true } } },
  });
  res.json({ rfqs });
});

businessRouter.post('/rfqs', async (req, res) => {
  const input = parse(rfqCreateSchema, req.body);
  const userId = authOf(req).user.id;
  const bp = await myProfile(userId);
  if (bp.verificationStatus !== 'APPROVED') throw forbidden('Your business must be verified before requesting quotations');
  const rfq = await prisma.rfq.create({
    data: {
      rfqNumber: referenceNumber('RFQ'),
      businessProfileId: bp.id,
      userId,
      title: input.title,
      notes: input.notes ?? null,
      neededBy: input.neededBy ? new Date(input.neededBy) : null,
      deliveryLocalityId: input.deliveryLocalityId,
      items: { create: input.items.map((i) => ({ variantId: i.variantId ?? null, description: i.description, quantity: i.quantity, unit: i.unit })) },
    },
  });
  // Notify HoReCa suppliers that serve the delivery locality.
  const stores = await prisma.store.findMany({
    where: { verticals: { has: 'HORECA' }, isActive: true, sellerOrg: { verificationStatus: 'APPROVED' }, serviceAreas: { some: { localityId: input.deliveryLocalityId } } },
    select: { id: true },
  });
  for (const s of stores) await notify(await sellerUserIds(s.id), { type: 'NEW_RFQ', title: `New RFQ: ${input.title}`, body: `${bp.businessName} requested a quotation.`, data: { rfqId: rfq.id } });
  res.status(201).json({ rfq, suppliersNotified: stores.length });
});

businessRouter.get('/rfqs/:id', async (req, res) => {
  const bp = await myProfile(authOf(req).user.id);
  const rfq = await prisma.rfq.findFirst({
    where: { id: String(req.params.id), businessProfileId: bp.id },
    include: {
      items: { include: { variant: { select: { sku: true, name: true } } } },
      deliveryLocality: { select: { name: true } },
      quotations: { orderBy: { grandTotal: 'asc' }, include: { store: { select: { id: true, name: true, ratingAvg: true, isDemo: true } }, items: true } },
    },
  });
  if (!rfq) throw notFound('RFQ');
  const now = new Date();
  res.json({ rfq: { ...rfq, quotations: rfq.quotations.map((q) => ({ ...q, expired: q.validUntil < now })) } });
});

businessRouter.post('/rfqs/:id/cancel', async (req, res) => {
  const bp = await myProfile(authOf(req).user.id);
  const r = await prisma.rfq.updateMany({ where: { id: String(req.params.id), businessProfileId: bp.id, status: { in: ['OPEN', 'QUOTED'] } }, data: { status: 'CANCELLED' } });
  if (!r.count) throw conflict('NOT_CANCELLABLE', 'This RFQ cannot be cancelled');
  res.json({ ok: true });
});

/**
 * Accepting a quotation creates a negotiated price list for this business at that store, valid until
 * the quotation expires. The buyer then orders through the normal cart at the negotiated prices.
 */
businessRouter.post('/quotations/:id/accept', async (req, res) => {
  const bp = await myProfile(authOf(req).user.id);
  const quotation = await prisma.quotation.findUnique({ where: { id: String(req.params.id) }, include: { rfq: true, items: true, store: true } });
  if (!quotation || quotation.rfq.businessProfileId !== bp.id) throw notFound('Quotation');
  if (quotation.status !== 'SUBMITTED' || quotation.validUntil < new Date()) throw conflict('QUOTATION_UNAVAILABLE', 'This quotation is no longer valid');
  if (!['OPEN', 'QUOTED'].includes(quotation.rfq.status)) throw conflict('RFQ_CLOSED', 'This RFQ is closed');

  const priced = quotation.items.filter((i) => i.available && i.variantId);
  const priceList = await prisma.$transaction(async (tx) => {
    const list = await tx.priceList.create({
      data: {
        storeId: quotation.storeId,
        name: `Negotiated – ${quotation.rfq.rfqNumber}`,
        type: 'NEGOTIATED',
        taxInclusive: false,
        businessProfileId: bp.id,
        sourceQuotationId: quotation.id,
        validTo: quotation.validUntil,
        items: { create: priced.map((i) => ({ variantId: i.variantId!, unitPrice: i.unitPrice })) },
      },
    });
    await tx.quotation.update({ where: { id: quotation.id }, data: { status: 'ACCEPTED' } });
    await tx.quotation.updateMany({ where: { rfqId: quotation.rfqId, id: { not: quotation.id }, status: 'SUBMITTED' }, data: { status: 'REJECTED' } });
    await tx.rfq.update({ where: { id: quotation.rfqId }, data: { status: 'ACCEPTED' } });
    return list;
  });
  await audit(req, 'QUOTATION_ACCEPTED', 'Quotation', quotation.id, { priceListId: priceList.id });
  await notify(await sellerUserIds(quotation.storeId), { type: 'QUOTATION_ACCEPTED', title: `Quotation accepted: ${quotation.rfq.rfqNumber}`, body: `${bp.businessName} accepted your quotation. Negotiated prices are now active for them.`, data: { rfqId: quotation.rfqId } });
  res.json({
    priceListId: priceList.id,
    storeId: quotation.storeId,
    storeSlug: quotation.store.slug,
    negotiatedItems: priced.length,
    unmatchedItems: quotation.items.filter((i) => i.available && !i.variantId).length,
  });
});
