import { Router } from 'express';
import { z } from 'zod';
import { assignDeliverySchema, couponSchema, orderTransitionSchema, ORDER_STATUSES, VERTICALS, verificationDecisionSchema } from '@padosi/shared';
import { prisma, Prisma } from '../lib/prisma';
import { AppError, conflict, notFound, parse } from '../lib/errors';
import { authOf, requireAuth, requirePermission } from '../middleware/auth';
import { audit } from '../lib/audit';
import { DEFAULT_SETTINGS, getSettings, invalidateSettings } from '../lib/settings';
import { adjustStock, transitionOrder } from '../services/orders';
import { loadFullOrder, orderView } from '../services/orderViews';
import { assignDelivery, availablePartners } from '../services/delivery';
import { notify } from '../providers/notifications';
import { payments } from '../providers/payments';

export const adminRouter = Router();
adminRouter.use(requireAuth);

const CONFIRMED_EXCLUDED = ['PENDING_PAYMENT', 'AWAITING_RX_REVIEW', 'CANCELLED', 'REJECTED'] as const;

// ── Metrics ──
adminRouter.get('/metrics', requirePermission('admin:dashboard'), async (req, res) => {
  const { days, cityId } = parse(z.object({ days: z.coerce.number().int().min(1).max(365).default(30), cityId: z.string().optional() }), req.query);
  const since = new Date(Date.now() - days * 86400_000);
  const cityFilter: Prisma.OrderWhereInput = cityId ? { store: { locality: { cityId } } } : {};
  const inPeriod: Prisma.OrderWhereInput = { placedAt: { gte: since }, ...cityFilter };
  const confirmed: Prisma.OrderWhereInput = { ...inPeriod, status: { notIn: [...CONFIRMED_EXCLUDED] } };

  const [conf, all, byStatus, byVertical, customers, delivered, commission, platformDiscount, riderPayouts, approvedSellers, onTimeRows, localityRows, daily] = await Promise.all([
    prisma.order.aggregate({ where: confirmed, _sum: { itemsSubtotal: true, grandTotal: true, deliveryFee: true }, _count: true }),
    prisma.order.count({ where: inPeriod }),
    prisma.order.groupBy({ by: ['status'], where: inPeriod, _count: true }),
    prisma.order.groupBy({ by: ['vertical'], where: confirmed, _sum: { itemsSubtotal: true }, _count: true }),
    prisma.order.groupBy({ by: ['userId'], where: confirmed, _count: true }),
    prisma.order.aggregate({ where: { ...inPeriod, status: 'DELIVERED' }, _sum: { deliveryFee: true }, _count: true }),
    prisma.commissionEntry.aggregate({ where: { order: inPeriod }, _sum: { commissionAmount: true, sellerEarning: true, saleAmount: true } }),
    prisma.order.aggregate({ where: { ...inPeriod, status: 'DELIVERED', sellerFundedDiscount: 0 }, _sum: { discountTotal: true } }),
    prisma.deliveryAssignment.aggregate({ where: { status: 'DELIVERED', order: inPeriod }, _sum: { earningAmount: true } }),
    prisma.sellerOrg.count({ where: { verificationStatus: 'APPROVED' } }),
    prisma.$queryRaw<{ on_time: bigint; measured: bigint }[]>`
      SELECT count(*) FILTER (WHERE o."deliveredAt" - o."placedAt" <= make_interval(mins => o."etaMaxMins")) AS on_time,
             count(*) AS measured
        FROM "Order" o JOIN "Store" s ON s.id = o."storeId" JOIN "Locality" l ON l.id = s."localityId"
       WHERE o.status = 'DELIVERED' AND o."etaMaxMins" IS NOT NULL AND o."scheduledFor" IS NULL
         AND o."placedAt" >= ${since} AND (${cityId ?? null}::text IS NULL OR l."cityId" = ${cityId ?? null})`,
    prisma.$queryRaw<{ city: string; locality: string; orders: bigint; gmv: bigint }[]>`
      SELECT c.name AS city, l.name AS locality, count(*) AS orders, coalesce(sum(o."itemsSubtotal"), 0) AS gmv
        FROM "Order" o JOIN "Store" s ON s.id = o."storeId"
        JOIN "Locality" l ON l.id = coalesce((SELECT a."localityId" FROM "Address" a WHERE a.id = o."addressId"), s."localityId")
        JOIN "City" c ON c.id = l."cityId"
       WHERE o."placedAt" >= ${since} AND o.status NOT IN ('PENDING_PAYMENT','AWAITING_RX_REVIEW','CANCELLED','REJECTED')
         AND (${cityId ?? null}::text IS NULL OR c.id = ${cityId ?? null})
       GROUP BY c.name, l.name ORDER BY gmv DESC LIMIT 20`,
    prisma.$queryRaw<{ day: Date; orders: bigint; gmv: bigint }[]>`
      SELECT date_trunc('day', o."placedAt" AT TIME ZONE 'Asia/Kolkata') AS day, count(*) AS orders, coalesce(sum(o."itemsSubtotal"), 0) AS gmv
        FROM "Order" o JOIN "Store" s ON s.id = o."storeId" JOIN "Locality" l ON l.id = s."localityId"
       WHERE o."placedAt" >= ${since} AND o.status NOT IN ('PENDING_PAYMENT','AWAITING_RX_REVIEW','CANCELLED','REJECTED')
         AND (${cityId ?? null}::text IS NULL OR l."cityId" = ${cityId ?? null})
       GROUP BY 1 ORDER BY 1`,
  ]);
  const activeSellers = await prisma.store.findMany({ where: { orders: { some: confirmed } }, select: { sellerOrgId: true }, distinct: ['sellerOrgId'] });

  const status = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
  const closed = status('DELIVERED') + status('CANCELLED') + status('REJECTED');
  const gmv = conf._sum.itemsSubtotal ?? 0;
  const commissionEarned = commission._sum.commissionAmount ?? 0;
  const deliveryFees = delivered._sum.deliveryFee ?? 0;
  const discounts = platformDiscount._sum.discountTotal ?? 0;
  const riderCost = riderPayouts._sum.earningAmount ?? 0;
  const onTime = onTimeRows[0];

  res.json({
    periodDays: days,
    definitions: {
      gmv: 'Value of goods in confirmed orders at selling price (incl. GST), before platform coupons. Not revenue.',
      platformRevenue: 'Commission on delivered orders + delivery fees on delivered orders.',
      contribution: 'Platform revenue − platform-funded discounts − delivery partner payouts. Excludes salaries, marketing, hosting and payment-gateway fees, so it is NOT net profit.',
      sellerEarnings: 'Amount owed to sellers for delivered orders after commission.',
    },
    gmv,
    totalOrders: conf._count,
    allOrdersCreated: all,
    averageOrderValue: conf._count ? Math.round((conf._sum.grandTotal ?? 0) / conf._count) : 0,
    activeCustomers: customers.length,
    repeatPurchaseRate: customers.length ? customers.filter((c) => c._count >= 2).length / customers.length : null,
    activeSellers: activeSellers.length,
    approvedSellers,
    fulfilmentRate: closed ? status('DELIVERED') / closed : null,
    onTimeDeliveryRate: Number(onTime?.measured ?? 0) > 0 ? Number(onTime.on_time) / Number(onTime.measured) : null,
    cancellationRate: all ? (status('CANCELLED') + status('REJECTED')) / all : null,
    revenue: {
      commission: commissionEarned,
      deliveryFees,
      platformRevenue: commissionEarned + deliveryFees,
      platformFundedDiscounts: discounts,
      deliveryPartnerPayouts: riderCost,
      contribution: commissionEarned + deliveryFees - discounts - riderCost,
      netProfit: null,
    },
    sellerEarnings: commission._sum.sellerEarning ?? 0,
    ordersByStatus: Object.fromEntries(byStatus.map((b) => [b.status, b._count])),
    byVertical: VERTICALS.map((v) => {
      const r = byVertical.find((b) => b.vertical === v);
      return { vertical: v, gmv: r?._sum.itemsSubtotal ?? 0, orders: r?._count ?? 0 };
    }),
    byLocality: localityRows.map((r) => ({ city: r.city, locality: r.locality, orders: Number(r.orders), gmv: Number(r.gmv) })),
    daily: daily.map((d) => ({ day: d.day, orders: Number(d.orders), gmv: Number(d.gmv) })),
    simulatedPayments: payments.simulated,
  });
});

// ── Seller verification ──
adminRouter.get('/sellers', requirePermission('admin:sellers'), async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'INFO_REQUIRED']).optional() }), req.query);
  const sellers = await prisma.sellerOrg.findMany({
    where: status ? { verificationStatus: status } : {},
    orderBy: { createdAt: 'desc' },
    include: {
      stores: { select: { id: true, name: true, verticals: true, isActive: true, locality: { select: { name: true } } } },
      licences: true,
      documents: { select: { id: true, type: true, status: true, fileId: true, createdAt: true } },
      members: { include: { user: { select: { name: true, phone: true, email: true } } } },
    },
  });
  res.json({ sellers });
});

adminRouter.post('/sellers/:id/verification', requirePermission('admin:sellers'), async (req, res) => {
  const input = parse(verificationDecisionSchema.extend({ approveLicences: z.boolean().default(true), commissionRateBps: z.number().int().min(0).max(5000).optional().nullable() }), req.body);
  const org = await prisma.sellerOrg.findUnique({ where: { id: String(req.params.id) }, include: { licences: true, members: true } });
  if (!org) throw notFound('Seller');
  if (input.status === 'APPROVED' && org.sellerType === 'PHARMACY' && !org.licences.some((l) => l.type === 'DRUG_LICENCE'))
    throw conflict('LICENCE_REQUIRED', 'A pharmacy cannot be approved without a drug licence on record');
  await prisma.$transaction(async (tx) => {
    await tx.sellerOrg.update({
      where: { id: org.id },
      data: { verificationStatus: input.status, reviewNotes: input.notes ?? null, reviewedAt: new Date(), ...(input.commissionRateBps !== undefined ? { commissionRateBps: input.commissionRateBps } : {}) },
    });
    if (input.status === 'APPROVED' && input.approveLicences) await tx.licence.updateMany({ where: { sellerOrgId: org.id, status: 'PENDING' }, data: { status: 'APPROVED' } });
    if (input.status === 'APPROVED') await tx.verificationDocument.updateMany({ where: { sellerOrgId: org.id, status: 'PENDING' }, data: { status: 'APPROVED' } });
    await audit(req, `SELLER_${input.status}`, 'SellerOrg', org.id, { notes: input.notes }, tx);
  });
  await notify(org.members.map((m) => m.userId), {
    type: 'SELLER_VERIFICATION',
    title: input.status === 'APPROVED' ? 'Your store is approved' : input.status === 'REJECTED' ? 'Seller application rejected' : 'More information needed',
    body: input.notes ?? (input.status === 'APPROVED' ? 'You can start receiving orders.' : 'Check your seller dashboard.'),
  });
  res.json({ ok: true });
});

adminRouter.post('/stores/:id/status', requirePermission('admin:sellers'), async (req, res) => {
  const { isActive } = parse(z.object({ isActive: z.boolean() }), req.body);
  await prisma.store.update({ where: { id: String(req.params.id) }, data: { isActive } });
  await audit(req, isActive ? 'STORE_ACTIVATED' : 'STORE_DEACTIVATED', 'Store', String(req.params.id));
  res.json({ ok: true });
});

// ── Business buyers ──
adminRouter.get('/business-profiles', requirePermission('admin:users'), async (_req, res) => {
  const profiles = await prisma.businessProfile.findMany({
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { name: true, phone: true, email: true } }, city: { select: { name: true } }, documents: { select: { id: true, type: true, fileId: true } } },
  });
  res.json({ profiles });
});

adminRouter.post('/business-profiles/:id/verification', requirePermission('admin:users'), async (req, res) => {
  const input = parse(
    verificationDecisionSchema.extend({
      creditApproved: z.boolean().optional(),
      creditLimit: z.number().int().min(0).max(100_000_000).optional(),
      creditDays: z.number().int().min(0).max(90).optional(),
    }),
    req.body,
  );
  const bp = await prisma.businessProfile.findUnique({ where: { id: String(req.params.id) } });
  if (!bp) throw notFound('Business profile');
  if (input.creditApproved && input.status !== 'APPROVED') throw new AppError(400, 'VALIDATION_ERROR', 'Credit can only be granted to verified businesses');
  await prisma.businessProfile.update({
    where: { id: bp.id },
    data: {
      verificationStatus: input.status,
      reviewNotes: input.notes ?? null,
      ...(input.creditApproved !== undefined ? { creditApproved: input.creditApproved } : {}),
      ...(input.creditLimit !== undefined ? { creditLimit: input.creditLimit } : {}),
      ...(input.creditDays !== undefined ? { creditDays: input.creditDays } : {}),
      ...(input.status !== 'APPROVED' ? { creditApproved: false } : {}),
    },
  });
  await audit(req, `BUSINESS_${input.status}`, 'BusinessProfile', bp.id, { creditApproved: input.creditApproved, creditLimit: input.creditLimit, creditDays: input.creditDays });
  await notify(bp.userId, { type: 'BUSINESS_VERIFICATION', title: `Business account ${input.status.toLowerCase().replace('_', ' ')}`, body: input.notes ?? 'Open your business dashboard for details.' });
  res.json({ ok: true });
});

// ── Delivery partners ──
adminRouter.get('/delivery-partners', requirePermission('admin:delivery'), async (_req, res) => {
  const partners = await prisma.deliveryPartner.findMany({
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { name: true, phone: true } }, city: { select: { name: true } }, _count: { select: { assignments: true } } },
  });
  res.json({ partners });
});

adminRouter.post('/delivery-partners/:id/verification', requirePermission('admin:delivery'), async (req, res) => {
  const input = parse(verificationDecisionSchema, req.body);
  const p = await prisma.deliveryPartner.update({
    where: { id: String(req.params.id) },
    data: { verificationStatus: input.status, ...(input.status !== 'APPROVED' ? { isOnline: false } : {}) },
  });
  await audit(req, `DELIVERY_PARTNER_${input.status}`, 'DeliveryPartner', p.id, { notes: input.notes });
  await notify(p.userId, { type: 'PARTNER_VERIFICATION', title: `Delivery partner account ${input.status.toLowerCase().replace('_', ' ')}`, body: input.notes ?? '' });
  res.json({ ok: true });
});

// ── Users ──
adminRouter.get('/users', requirePermission('admin:users'), async (req, res) => {
  const { q, role } = parse(z.object({ q: z.string().optional(), role: z.string().optional() }), req.query);
  const users = await prisma.user.findMany({
    where: {
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }, { email: { contains: q, mode: 'insensitive' } }] } : {}),
      ...(role ? { roles: { some: { role: role as never } } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { id: true, name: true, phone: true, email: true, status: true, isDemo: true, createdAt: true, roles: { select: { role: true } }, _count: { select: { orders: true } } },
  });
  res.json({ users });
});

adminRouter.post('/users/:id/status', requirePermission('admin:users'), async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) }), req.body);
  if (String(req.params.id) === authOf(req).user.id) throw new AppError(400, 'SELF', 'You cannot change your own status');
  const target = await prisma.user.findUnique({ where: { id: String(req.params.id) }, include: { roles: true } });
  if (!target) throw notFound('User');
  if (target.roles.some((r) => r.role === 'SUPER_ADMIN') && !authOf(req).roles.includes('SUPER_ADMIN')) throw new AppError(403, 'FORBIDDEN', 'Only a super admin can change another super admin');
  await prisma.$transaction([
    prisma.user.update({ where: { id: target.id }, data: { status } }),
    ...(status === 'SUSPENDED' ? [prisma.session.deleteMany({ where: { userId: target.id } })] : []),
  ]);
  await audit(req, `USER_${status}`, 'User', target.id);
  res.json({ ok: true });
});

// ── Orders ──
adminRouter.get('/orders', requirePermission('admin:orders'), async (req, res) => {
  const q = parse(z.object({ status: z.enum(ORDER_STATUSES).optional(), q: z.string().optional(), page: z.coerce.number().int().min(1).default(1) }), req.query);
  const where: Prisma.OrderWhereInput = { ...(q.status ? { status: q.status } : {}), ...(q.q ? { orderNumber: { contains: q.q.toUpperCase() } } : {}) };
  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { placedAt: 'desc' },
      skip: (q.page - 1) * 30,
      take: 30,
      include: { store: { select: { name: true, localityId: true } }, user: { select: { name: true } } },
    }),
    prisma.order.count({ where }),
  ]);
  res.json({
    total,
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod,
      vertical: o.vertical,
      channel: o.channel,
      fulfilmentType: o.fulfilmentType,
      grandTotal: o.grandTotal,
      placedAt: o.placedAt,
      storeName: o.store.name,
      customerName: o.user.name,
    })),
  });
});

adminRouter.get('/orders/:id', requirePermission('admin:orders'), async (req, res) => {
  const order = await loadFullOrder(String(req.params.id));
  if (!order) throw notFound('Order');
  const store = await prisma.store.findUniqueOrThrow({ where: { id: order.storeId }, include: { locality: true } });
  res.json({ order: await orderView(order, 'ADMIN'), partners: await availablePartners(store.locality.cityId) });
});

adminRouter.post('/orders/:id/transition', requirePermission('admin:orders'), async (req, res) => {
  const { to, reason } = parse(orderTransitionSchema, req.body);
  if (!reason) throw new AppError(400, 'VALIDATION_ERROR', 'Admins must give a reason for status changes', { fields: { reason: 'Required' } });
  await transitionOrder({ orderId: String(req.params.id), to, actor: 'ADMIN', actorUserId: authOf(req).user.id, note: reason });
  await audit(req, 'ORDER_STATUS_OVERRIDE', 'Order', String(req.params.id), { to, reason });
  res.json({ order: await orderView((await loadFullOrder(String(req.params.id)))!, 'ADMIN') });
});

adminRouter.post('/orders/:id/assign', requirePermission('admin:delivery'), async (req, res) => {
  const { deliveryPartnerId } = parse(assignDeliverySchema, req.body);
  await assignDelivery(String(req.params.id), deliveryPartnerId, authOf(req).user.id);
  await audit(req, 'DELIVERY_ASSIGNED', 'Order', String(req.params.id), { deliveryPartnerId });
  res.json({ order: await orderView((await loadFullOrder(String(req.params.id)))!, 'ADMIN') });
});

// ── Geography ──
adminRouter.get('/geo', requirePermission('admin:zones'), async (_req, res) => {
  const cities = await prisma.city.findMany({
    orderBy: { name: 'asc' },
    include: { zones: { orderBy: { name: 'asc' } }, localities: { orderBy: { name: 'asc' }, include: { _count: { select: { storeServiceAreas: true } } } } },
  });
  res.json({ cities });
});

adminRouter.post('/cities', requirePermission('admin:zones'), async (req, res) => {
  const input = parse(
    z.object({ name: z.string().trim().min(2), state: z.string().trim().min(2), stateCode: z.string().regex(/^\d{2}$/), lat: z.number(), lng: z.number(), isActive: z.boolean().default(false) }),
    req.body,
  );
  const city = await prisma.city.create({ data: { ...input, slug: input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') } });
  await audit(req, 'CITY_CREATED', 'City', city.id);
  res.status(201).json({ city });
});

adminRouter.patch('/cities/:id', requirePermission('admin:zones'), async (req, res) => {
  const { isActive } = parse(z.object({ isActive: z.boolean() }), req.body);
  const city = await prisma.city.update({ where: { id: String(req.params.id) }, data: { isActive } });
  await audit(req, isActive ? 'CITY_ACTIVATED' : 'CITY_DEACTIVATED', 'City', city.id);
  res.json({ city });
});

adminRouter.post('/zones', requirePermission('admin:zones'), async (req, res) => {
  const input = parse(z.object({ cityId: z.string(), name: z.string().trim().min(2), isActive: z.boolean().default(true) }), req.body);
  const zone = await prisma.serviceZone.create({ data: input });
  await audit(req, 'ZONE_CREATED', 'ServiceZone', zone.id);
  res.status(201).json({ zone });
});

adminRouter.patch('/zones/:id', requirePermission('admin:zones'), async (req, res) => {
  const { isActive } = parse(z.object({ isActive: z.boolean() }), req.body);
  const zone = await prisma.serviceZone.update({ where: { id: String(req.params.id) }, data: { isActive } });
  await audit(req, isActive ? 'ZONE_ACTIVATED' : 'ZONE_PAUSED', 'ServiceZone', zone.id);
  res.json({ zone });
});

adminRouter.post('/localities', requirePermission('admin:zones'), async (req, res) => {
  const input = parse(
    z.object({ cityId: z.string(), zoneId: z.string().nullable().optional(), name: z.string().trim().min(2), postalCode: z.string().regex(/^[1-9]\d{5}$/), lat: z.number(), lng: z.number() }),
    req.body,
  );
  const locality = await prisma.locality.create({ data: input });
  await audit(req, 'LOCALITY_CREATED', 'Locality', locality.id);
  res.status(201).json({ locality });
});

adminRouter.patch('/localities/:id', requirePermission('admin:zones'), async (req, res) => {
  const { zoneId } = parse(z.object({ zoneId: z.string().nullable() }), req.body);
  const locality = await prisma.locality.update({ where: { id: String(req.params.id) }, data: { zoneId } });
  await audit(req, 'LOCALITY_ZONE_CHANGED', 'Locality', locality.id, { zoneId });
  res.json({ locality });
});

// ── Catalogue ──
adminRouter.get('/catalog', requirePermission('admin:catalog'), async (_req, res) => {
  const [categories, brands, products] = await Promise.all([
    prisma.category.findMany({ orderBy: [{ vertical: 'asc' }, { sortOrder: 'asc' }], include: { _count: { select: { products: true } } } }),
    prisma.brand.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { products: true } } } }),
    prisma.product.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 200,
      select: { id: true, name: true, vertical: true, isActive: true, isRestricted: true, requiresPrescription: true, schedule: true, isDemo: true, category: { select: { name: true } }, _count: { select: { variants: true } } },
    }),
  ]);
  res.json({ categories, brands, products });
});

adminRouter.post('/categories', requirePermission('admin:catalog'), async (req, res) => {
  const input = parse(
    z.object({ name: z.string().trim().min(2).max(60), vertical: z.enum(VERTICALS), parentId: z.string().nullable().optional(), icon: z.string().max(8).optional(), sortOrder: z.number().int().default(0) }),
    req.body,
  );
  const slug = `${input.vertical.toLowerCase()}-${input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const category = await prisma.category.create({ data: { ...input, slug } });
  await audit(req, 'CATEGORY_CREATED', 'Category', category.id);
  res.status(201).json({ category });
});

adminRouter.patch('/categories/:id', requirePermission('admin:catalog'), async (req, res) => {
  const input = parse(z.object({ name: z.string().trim().min(2).max(60).optional(), isActive: z.boolean().optional(), sortOrder: z.number().int().optional() }), req.body);
  const category = await prisma.category.update({ where: { id: String(req.params.id) }, data: input });
  res.json({ category });
});

adminRouter.post('/brands', requirePermission('admin:catalog'), async (req, res) => {
  const { name } = parse(z.object({ name: z.string().trim().min(2).max(60) }), req.body);
  const brand = await prisma.brand.create({ data: { name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') } });
  res.status(201).json({ brand });
});

adminRouter.patch('/products/:id', requirePermission('admin:catalog'), async (req, res) => {
  const input = parse(z.object({ isActive: z.boolean().optional(), isRestricted: z.boolean().optional() }), req.body);
  const product = await prisma.product.update({ where: { id: String(req.params.id) }, data: input });
  await audit(req, 'PRODUCT_MODERATED', 'Product', product.id, input);
  res.json({ product });
});

// ── Coupons ──
adminRouter.get('/coupons', requirePermission('admin:coupons'), async (_req, res) => {
  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' }, include: { _count: { select: { redemptions: true } }, store: { select: { name: true } }, city: { select: { name: true } } } });
  res.json({ coupons });
});

adminRouter.post('/coupons', requirePermission('admin:coupons'), async (req, res) => {
  const input = parse(couponSchema, req.body);
  if (input.discountType === 'PERCENT' && (input.value < 1 || input.value > 90)) throw new AppError(400, 'VALIDATION_ERROR', 'Percentage must be 1–90', { fields: { value: '1–90' } });
  if (new Date(input.validTo) <= new Date(input.validFrom)) throw new AppError(400, 'VALIDATION_ERROR', 'End date must be after start date', { fields: { validTo: 'Must be after start' } });
  const coupon = await prisma.coupon.create({ data: { ...input, validFrom: new Date(input.validFrom), validTo: new Date(input.validTo) } });
  await audit(req, 'COUPON_CREATED', 'Coupon', coupon.id, { code: coupon.code });
  res.status(201).json({ coupon });
});

adminRouter.patch('/coupons/:id', requirePermission('admin:coupons'), async (req, res) => {
  const { isActive } = parse(z.object({ isActive: z.boolean() }), req.body);
  const coupon = await prisma.coupon.update({ where: { id: String(req.params.id) }, data: { isActive } });
  await audit(req, isActive ? 'COUPON_ENABLED' : 'COUPON_DISABLED', 'Coupon', coupon.id);
  res.json({ coupon });
});

// ── Settings (super admin) ──
adminRouter.get('/settings', requirePermission('admin:settings'), async (_req, res) => {
  res.json({ settings: await getSettings(), defaults: DEFAULT_SETTINGS });
});

const settingsSchema = z.object({
  delivery: z.object({ avgSpeedKmph: z.number().min(5).max(60), bufferMins: z.number().int().min(0).max(120), roadFactor: z.number().min(1).max(2), perKmFee: z.number().int().min(0), freeKm: z.number().min(0) }).optional(),
  commissionBps: z.object({ GROCERY: z.number().int().min(0).max(5000), HORECA: z.number().int().min(0).max(5000), CHEMIST: z.number().int().min(0).max(5000) }).optional(),
  customerCancellableStatuses: z.array(z.enum(['AWAITING_RX_REVIEW', 'PENDING_PAYMENT', 'PLACED'])).optional(),
  deliveryPartnerPayout: z.object({ basePerDelivery: z.number().int().min(0), perKm: z.number().int().min(0) }).optional(),
  codMaxOrderValue: z.number().int().min(0).optional(),
  pendingPaymentTimeoutMins: z.number().int().min(5).max(120).optional(),
  returnWindowHours: z.number().int().min(0).max(720).optional(),
  support: z.object({ phone: z.string().max(40), email: z.string().email(), hours: z.string().max(80) }).optional(),
});

adminRouter.put('/settings', requirePermission('admin:settings'), async (req, res) => {
  const input = parse(settingsSchema, req.body);
  const before = await getSettings();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    await prisma.platformSetting.upsert({ where: { key }, create: { key, value: value as Prisma.InputJsonValue }, update: { value: value as Prisma.InputJsonValue } });
  }
  invalidateSettings();
  await audit(req, 'SETTINGS_UPDATED', 'PlatformSetting', null, { changed: Object.keys(input), before: Object.fromEntries(Object.keys(input).map((k) => [k, before[k as keyof typeof before]])) });
  res.json({ settings: await getSettings() });
});

// ── Support, returns ──
adminRouter.get('/tickets', requirePermission('admin:support'), async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional() }), req.query);
  const tickets = await prisma.supportTicket.findMany({
    where: status ? { status } : {},
    orderBy: { updatedAt: 'desc' },
    include: { user: { select: { name: true } }, order: { select: { id: true, orderNumber: true } }, _count: { select: { messages: true } } },
  });
  res.json({ tickets });
});

adminRouter.post('/tickets/:id/status', requirePermission('admin:support'), async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']) }), req.body);
  const t = await prisma.supportTicket.update({ where: { id: String(req.params.id) }, data: { status } });
  await notify(t.userId, { type: 'TICKET_UPDATE', title: `Ticket ${t.ticketNumber}: ${status.toLowerCase().replace('_', ' ')}`, body: t.subject, data: { ticketId: t.id } });
  res.json({ ticket: t });
});

adminRouter.get('/returns', requirePermission('admin:support'), async (_req, res) => {
  const returns = await prisma.returnRequest.findMany({
    orderBy: { createdAt: 'desc' },
    include: { order: { select: { id: true, orderNumber: true, paymentMethod: true, paymentStatus: true, store: { select: { name: true } } } }, user: { select: { name: true } } },
  });
  res.json({ returns });
});

/** Approving a return records a refund. With the mock gateway it completes instantly; COD refunds are manual (bank/UPI transfer). */
adminRouter.post('/returns/:id/decision', requirePermission('admin:support'), async (req, res) => {
  const input = parse(z.object({ decision: z.enum(['APPROVED', 'REJECTED']), note: z.string().trim().min(3).max(500), restock: z.boolean().default(false) }), req.body);
  const rr = await prisma.returnRequest.findUnique({ where: { id: String(req.params.id) }, include: { order: { include: { payments: true, items: true } } } });
  if (!rr) throw notFound('Return request');
  if (rr.status !== 'REQUESTED') throw conflict('ALREADY_DECIDED', 'This return has already been decided');
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.returnRequest.updateMany({ where: { id: rr.id, status: 'REQUESTED' }, data: { status: input.decision === 'APPROVED' ? 'REFUNDED' : 'REJECTED', resolutionNote: input.note } });
    if (claimed.count !== 1) throw conflict('ALREADY_DECIDED', 'This return has already been decided');
    if (input.decision === 'REJECTED') return;
    const items = rr.items as { orderItemId: string; quantity: number }[];
    for (const it of items) {
      await tx.orderItem.update({ where: { id: it.orderItemId }, data: { returnedQty: { increment: it.quantity } } });
      if (input.restock) {
        const oi = rr.order.items.find((x) => x.id === it.orderItemId)!;
        await adjustStock(tx, { storeId: rr.order.storeId, variantId: oi.variantId, delta: it.quantity, reason: 'RETURN_RESTOCK', actorUserId: authOf(req).user.id, orderId: rr.orderId });
      }
    }
    const online = rr.order.payments.find((p) => p.status === 'SUCCEEDED' && !['cod', 'credit'].includes(p.provider));
    const processed = !!online && payments.simulated;
    await tx.refund.create({
      data: { orderId: rr.orderId, returnRequestId: rr.id, amount: rr.amount, reason: `Return: ${rr.reason}`, status: processed ? 'PROCESSED' : 'PENDING', processedAt: processed ? new Date() : null },
    });
    if (online && processed) await tx.paymentTransaction.create({ data: { paymentId: online.id, type: 'REFUND', amount: rr.amount, status: 'PROCESSED', providerTxnId: `mock_refund_${rr.id}` } });
    await audit(req, 'RETURN_APPROVED', 'ReturnRequest', rr.id, { amount: rr.amount, restock: input.restock }, tx);
  });
  await notify(rr.userId, { type: 'RETURN_UPDATE', title: `Return ${input.decision.toLowerCase()} for ${rr.order.orderNumber}`, body: input.note, data: { orderId: rr.orderId } });
  res.json({ ok: true });
});

// ── Settlements ──
adminRouter.get('/settlements', requirePermission('admin:settlements'), async (_req, res) => {
  const [settlements, unsettled] = await Promise.all([
    prisma.settlement.findMany({ orderBy: { createdAt: 'desc' }, include: { sellerOrg: { select: { name: true } } } }),
    prisma.commissionEntry.groupBy({ by: ['sellerOrgId'], where: { settlementId: null }, _sum: { saleAmount: true, commissionAmount: true, sellerEarning: true }, _count: true }),
  ]);
  const orgs = await prisma.sellerOrg.findMany({ where: { id: { in: unsettled.map((u) => u.sellerOrgId) } }, select: { id: true, name: true } });
  res.json({
    settlements,
    unsettled: unsettled.map((u) => ({
      sellerOrgId: u.sellerOrgId,
      sellerName: orgs.find((o) => o.id === u.sellerOrgId)?.name,
      orders: u._count,
      sales: u._sum.saleAmount ?? 0,
      commission: u._sum.commissionAmount ?? 0,
      payable: u._sum.sellerEarning ?? 0,
    })),
  });
});

adminRouter.post('/settlements', requirePermission('admin:settlements'), async (req, res) => {
  const { sellerOrgId } = parse(z.object({ sellerOrgId: z.string() }), req.body);
  const settlement = await prisma.$transaction(async (tx) => {
    const entries = await tx.commissionEntry.findMany({ where: { sellerOrgId, settlementId: null }, orderBy: { createdAt: 'asc' } });
    if (!entries.length) throw conflict('NOTHING_TO_SETTLE', 'No unsettled orders for this seller');
    const s = await tx.settlement.create({
      data: {
        sellerOrgId,
        periodStart: entries[0].createdAt,
        periodEnd: entries[entries.length - 1].createdAt,
        orderCount: entries.length,
        grossSales: entries.reduce((a, e) => a + e.saleAmount, 0),
        commissionAmount: entries.reduce((a, e) => a + e.commissionAmount, 0),
        netPayable: entries.reduce((a, e) => a + e.sellerEarning, 0),
      },
    });
    await tx.commissionEntry.updateMany({ where: { id: { in: entries.map((e) => e.id) }, settlementId: null }, data: { settlementId: s.id } });
    await audit(req, 'SETTLEMENT_CREATED', 'Settlement', s.id, { sellerOrgId, netPayable: s.netPayable }, tx);
    return s;
  });
  res.status(201).json({ settlement });
});

adminRouter.post('/settlements/:id/paid', requirePermission('admin:settlements'), async (req, res) => {
  const { reference } = parse(z.object({ reference: z.string().trim().min(3).max(80) }), req.body);
  const r = await prisma.settlement.updateMany({ where: { id: String(req.params.id), status: { not: 'PAID' } }, data: { status: 'PAID', paidAt: new Date(), reference } });
  if (!r.count) throw conflict('ALREADY_PAID', 'Settlement already marked paid');
  await audit(req, 'SETTLEMENT_MARKED_PAID', 'Settlement', String(req.params.id), { reference });
  res.json({ ok: true });
});

// ── Audit log ──
adminRouter.get('/audit-logs', requirePermission('admin:audit'), async (req, res) => {
  const { entityType, page } = parse(z.object({ entityType: z.string().optional(), page: z.coerce.number().int().min(1).default(1) }), req.query);
  const logs = await prisma.auditLog.findMany({
    where: entityType ? { entityType } : {},
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * 50,
    take: 50,
    include: { actor: { select: { name: true } } },
  });
  res.json({ logs });
});
