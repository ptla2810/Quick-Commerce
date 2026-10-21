import { Router } from 'express';
import { z } from 'zod';
import { addressSchema, supportTicketSchema, ticketMessageSchema } from '@padosi/shared';
import { prisma } from '../lib/prisma';
import { AppError, forbidden, notFound, parse } from '../lib/errors';
import { authOf, isAdmin, requireAuth } from '../middleware/auth';
import { referenceNumber } from '../lib/crypto';
import { audit } from '../lib/audit';
import { getSettings } from '../lib/settings';
import { saveUpload, upload } from '../lib/upload';
import { storage } from '../providers/storage';
import { resolveLocation } from '../services/serviceability';

export const accountRouter = Router();
accountRouter.use(requireAuth);

// ── Addresses ──
accountRouter.get('/addresses', async (req, res) => {
  const addresses = await prisma.address.findMany({
    where: { userId: authOf(req).user.id, isDeleted: false },
    include: { locality: { include: { city: true, zone: true } } },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
  res.json({
    addresses: addresses.map(({ locality, ...a }) => ({ ...a, locality: { id: locality.id, name: locality.name, city: locality.city.name }, serviceable: !!locality.zone?.isActive })),
  });
});

accountRouter.post('/addresses', async (req, res) => {
  const input = parse(addressSchema, req.body);
  const userId = authOf(req).user.id;
  const { locality } = await resolveLocation({ localityId: input.localityId });
  if (locality.postalCode !== input.postalCode) throw new AppError(400, 'VALIDATION_ERROR', 'PIN code does not match the selected locality', { fields: { postalCode: `Expected ${locality.postalCode} for ${locality.name}` } });
  const count = await prisma.address.count({ where: { userId, isDeleted: false } });
  if (count >= 20) throw new AppError(400, 'LIMIT', 'You can save up to 20 addresses');
  const isDefault = input.isDefault || count === 0;
  const address = await prisma.$transaction(async (tx) => {
    if (isDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    return tx.address.create({ data: { ...input, userId, isDefault } });
  });
  res.status(201).json({ address });
});

accountRouter.patch('/addresses/:id', async (req, res) => {
  const input = parse(addressSchema.partial(), req.body);
  const userId = authOf(req).user.id;
  const existing = await prisma.address.findFirst({ where: { id: String(req.params.id), userId, isDeleted: false } });
  if (!existing) throw notFound('Address');
  const address = await prisma.$transaction(async (tx) => {
    if (input.isDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    return tx.address.update({ where: { id: existing.id }, data: input });
  });
  res.json({ address });
});

accountRouter.delete('/addresses/:id', async (req, res) => {
  // Soft delete: past orders keep their own address snapshot.
  const r = await prisma.address.updateMany({ where: { id: String(req.params.id), userId: authOf(req).user.id }, data: { isDeleted: true, isDefault: false } });
  if (!r.count) throw notFound('Address');
  res.json({ ok: true });
});

// ── Favourites ──
accountRouter.get('/favourites', async (req, res) => {
  const userId = authOf(req).user.id;
  const [products, stores] = await Promise.all([
    prisma.favouriteProduct.findMany({ where: { userId }, include: { product: { select: { id: true, slug: true, name: true, vertical: true, category: { select: { icon: true } } } } } }),
    prisma.favouriteStore.findMany({ where: { userId }, include: { store: { select: { id: true, slug: true, name: true, verticals: true, ratingAvg: true } } } }),
  ]);
  res.json({ products: products.map((p) => p.product), stores: stores.map((s) => s.store) });
});

const favSchema = z.object({ type: z.enum(['product', 'store']), id: z.string(), favourite: z.boolean() });
accountRouter.post('/favourites', async (req, res) => {
  const { type, id, favourite } = parse(favSchema, req.body);
  const userId = authOf(req).user.id;
  if (type === 'product') {
    if (favourite) await prisma.favouriteProduct.upsert({ where: { userId_productId: { userId, productId: id } }, create: { userId, productId: id }, update: {} });
    else await prisma.favouriteProduct.deleteMany({ where: { userId, productId: id } });
  } else {
    if (favourite) await prisma.favouriteStore.upsert({ where: { userId_storeId: { userId, storeId: id } }, create: { userId, storeId: id }, update: {} });
    else await prisma.favouriteStore.deleteMany({ where: { userId, storeId: id } });
  }
  res.json({ ok: true, favourite });
});

// ── Notifications ──
accountRouter.get('/notifications', async (req, res) => {
  const userId = authOf(req).user.id;
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  res.json({ notifications: items, unread });
});

accountRouter.post('/notifications/read', async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(z.string()).optional() }), req.body);
  await prisma.notification.updateMany({ where: { userId: authOf(req).user.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
  res.json({ ok: true });
});

// ── Coupons ──
accountRouter.get('/coupons', async (req, res) => {
  const now = new Date();
  const coupons = await prisma.coupon.findMany({
    where: { isActive: true, validFrom: { lte: now }, validTo: { gte: now } },
    include: { store: { select: { name: true } }, city: { select: { name: true } } },
    orderBy: { validTo: 'asc' },
  });
  const used = await prisma.couponRedemption.groupBy({ by: ['couponId'], where: { userId: authOf(req).user.id }, _count: true });
  const usedBy = new Map(used.map((u) => [u.couponId, u._count]));
  res.json({
    coupons: coupons.map((c) => ({
      code: c.code,
      description: c.description,
      discountType: c.discountType,
      value: c.value,
      maxDiscount: c.maxDiscount,
      minOrderValue: c.minOrderValue,
      vertical: c.vertical,
      storeName: c.store?.name ?? null,
      cityName: c.city?.name ?? null,
      validTo: c.validTo,
      firstOrderOnly: c.firstOrderOnly,
      usedUp: (usedBy.get(c.id) ?? 0) >= c.perUserLimit,
    })),
  });
});

// ── Support ──
accountRouter.get('/support/tickets', async (req, res) => {
  const tickets = await prisma.supportTicket.findMany({
    where: { userId: authOf(req).user.id },
    orderBy: { updatedAt: 'desc' },
    include: { order: { select: { orderNumber: true } }, _count: { select: { messages: true } } },
  });
  res.json({ tickets });
});

accountRouter.post('/support/tickets', async (req, res) => {
  const input = parse(supportTicketSchema, req.body);
  const userId = authOf(req).user.id;
  if (input.orderId) {
    const o = await prisma.order.findFirst({ where: { id: input.orderId, userId } });
    if (!o) throw notFound('Order');
  }
  const ticket = await prisma.supportTicket.create({
    data: {
      ticketNumber: referenceNumber('TK'),
      userId,
      orderId: input.orderId ?? null,
      category: input.category,
      subject: input.subject,
      messages: { create: { authorId: userId, body: input.message } },
    },
  });
  res.status(201).json({ ticket });
});

accountRouter.get('/support/tickets/:id', async (req, res) => {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: String(req.params.id) },
    include: { messages: { orderBy: { createdAt: 'asc' }, include: { author: { select: { name: true } } } }, order: { select: { id: true, orderNumber: true } } },
  });
  if (!ticket || (ticket.userId !== authOf(req).user.id && !isAdmin(req))) throw notFound('Ticket');
  res.json({ ticket });
});

accountRouter.post('/support/tickets/:id/messages', async (req, res) => {
  const { body } = parse(ticketMessageSchema, req.body);
  const auth = authOf(req);
  const ticket = await prisma.supportTicket.findUnique({ where: { id: String(req.params.id) } });
  const staff = isAdmin(req);
  if (!ticket || (ticket.userId !== auth.user.id && !staff)) throw notFound('Ticket');
  await prisma.ticketMessage.create({ data: { ticketId: ticket.id, authorId: auth.user.id, body, isStaff: staff && ticket.userId !== auth.user.id } });
  await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: staff ? 'IN_PROGRESS' : ticket.status === 'RESOLVED' ? 'OPEN' : ticket.status } });
  res.status(201).json({ ok: true });
});

// ── Prescriptions ──
accountRouter.get('/prescriptions', async (req, res) => {
  const list = await prisma.prescription.findMany({
    where: { userId: authOf(req).user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      file: { select: { id: true, originalName: true, mimeType: true } },
      reviews: { orderBy: { createdAt: 'desc' }, take: 1, select: { decision: true, notes: true, createdAt: true, isSimulated: true } },
      approvedItems: { include: { product: { select: { name: true } } } },
      orders: { select: { id: true, orderNumber: true, status: true } },
    },
  });
  res.json({ prescriptions: list });
});

accountRouter.post('/prescriptions', upload.single('file'), async (req, res) => {
  const meta = parse(
    z.object({
      patientName: z.string().trim().min(2).max(80),
      doctorName: z.string().trim().max(80).optional(),
      issuedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }),
    req.body,
  );
  const userId = authOf(req).user.id;
  const file = await saveUpload(req.file, userId, 'PRESCRIPTION');
  const rx = await prisma.prescription.create({
    data: { userId, fileId: file.id, patientName: meta.patientName, doctorName: meta.doctorName ?? null, issuedOn: meta.issuedOn ? new Date(meta.issuedOn) : null },
  });
  res.status(201).json({ prescription: rx });
});

/**
 * Private file access. Prescriptions: the owner, a pharmacist of a store holding an order for that
 * prescription, or a super admin. Verification documents: the uploader or an admin.
 * Every non-owner access is written to the audit log.
 */
accountRouter.get('/files/:id', async (req, res) => {
  const auth = authOf(req);
  const file = await prisma.storedFile.findUnique({ where: { id: String(req.params.id) }, include: { prescriptions: { select: { id: true } } } });
  if (!file) throw notFound('File');
  let allowed = file.ownerUserId === auth.user.id;
  if (!allowed && file.purpose === 'PRESCRIPTION') {
    const rxIds = file.prescriptions.map((p) => p.id);
    const viaOrder = await prisma.order.findFirst({
      where: { prescriptionId: { in: rxIds }, store: { sellerOrg: { members: { some: { userId: auth.user.id, role: 'PHARMACIST' } } } } },
      select: { id: true },
    });
    allowed = !!viaOrder || auth.roles.includes('SUPER_ADMIN');
  }
  if (!allowed && file.purpose === 'VERIFICATION') allowed = isAdmin(req);
  if (!allowed && file.purpose === 'PRODUCT_IMAGE') allowed = true;
  if (!allowed) throw forbidden('You cannot view this file');
  if (file.ownerUserId !== auth.user.id) await audit(req, 'FILE_ACCESSED', 'StoredFile', file.id, { purpose: file.purpose });
  const data = await storage.get(file.storageKey);
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${file.originalName.replace(/"/g, '')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(data);
});

export const publicRouter = Router();

publicRouter.get('/support/info', async (_req, res) => {
  const s = await getSettings();
  res.json({
    contact: s.support,
    faqs: [
      { q: 'How long does delivery take?', a: 'Each store shows an estimated delivery window based on its preparation time and distance. It is an estimate, not a guarantee — live status is on your order page.' },
      { q: 'Can I pay cash on delivery?', a: 'Yes, for orders up to the cash-on-delivery limit. You can also pay by UPI, card or net banking.' },
      { q: 'Why can I only order from one store at a time?', a: 'Each order is packed and delivered by one local store, which keeps stock accurate and delivery fast.' },
      { q: 'How do I order prescription medicines?', a: 'Upload a clear photo of a valid prescription at checkout. A registered pharmacist at the pharmacy reviews it before the order is confirmed. Orders are never dispensed without that review.' },
      { q: 'How do I cancel an order?', a: 'You can cancel from the order page until the store accepts it. After that, contact support.' },
      { q: 'How do refunds work?', a: 'For online payments, refunds go back to the original payment method once a cancellation or return is approved. Bank timelines may vary.' },
      { q: 'What is a HoReCa account?', a: 'Hotels, restaurants, cafés and caterers can register a business account for wholesale prices, bulk ordering, quotations and GST invoices.' },
    ],
  });
});
