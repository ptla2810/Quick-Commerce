import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  assignDeliverySchema,
  DOCUMENT_TYPES,
  inventoryUpdateSchema,
  orderTransitionSchema,
  prescriptionReviewSchema,
  productCreateSchema,
  quotationCreateSchema,
  sellerOnboardingSchema,
  storeSettingsSchema,
  exclusiveTax,
  ORDER_STATUSES,
} from '@padosi/shared';
import { prisma, Prisma } from '../lib/prisma';
import { AppError, conflict, forbidden, notFound, parse } from '../lib/errors';
import { authOf, requireAuth, requireStoreMember } from '../middleware/auth';
import { audit } from '../lib/audit';
import { saveUpload, upload } from '../lib/upload';
import { parseCsv, toCsv } from '../lib/csv';
import { adjustStock, transitionOrder } from '../services/orders';
import { loadFullOrder, orderView } from '../services/orderViews';
import { assignDelivery, availablePartners } from '../services/delivery';
import { notify } from '../providers/notifications';

export const sellerRouter = Router();
sellerRouter.use(requireAuth);

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
const uniqueSuffix = () => Math.random().toString(36).slice(2, 7);

// ── Onboarding ──
sellerRouter.post('/onboarding', async (req, res) => {
  const input = parse(sellerOnboardingSchema, req.body);
  const userId = authOf(req).user.id;
  if (input.sellerType === 'PHARMACY' && !input.licences.some((l) => l.type === 'DRUG_LICENCE'))
    throw new AppError(400, 'VALIDATION_ERROR', 'Pharmacies must provide a drug licence number', { fields: { licences: 'Drug licence required' } });
  if (input.store.verticals.includes('CHEMIST') && input.sellerType !== 'PHARMACY')
    throw new AppError(400, 'VALIDATION_ERROR', 'Only pharmacies can sell in the Chemist category', { fields: { 'store.verticals': 'Chemist requires a pharmacy' } });
  const localities = await prisma.locality.findMany({ where: { id: { in: [input.store.localityId, ...input.store.serviceLocalityIds] } } });
  if (localities.length < new Set([input.store.localityId, ...input.store.serviceLocalityIds]).size) throw notFound('Locality');

  const org = await prisma.$transaction(async (tx) => {
    const org = await tx.sellerOrg.create({
      data: {
        name: input.orgName,
        legalName: input.legalName,
        sellerType: input.sellerType,
        gstin: input.gstin ?? null,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail,
        members: { create: { userId, role: 'OWNER' } },
        licences: { create: input.licences.map((l) => ({ type: l.type, number: l.number, validUntil: l.validUntil ? new Date(l.validUntil) : null })) },
      },
    });
    const store = await tx.store.create({
      data: {
        sellerOrgId: org.id,
        name: input.store.name,
        slug: `${slugify(input.store.name)}-${uniqueSuffix()}`,
        verticals: input.store.verticals,
        addressLine: input.store.addressLine,
        localityId: input.store.localityId,
        postalCode: input.store.postalCode,
        lat: input.store.lat,
        lng: input.store.lng,
        phone: input.store.phone,
        openMinute: input.store.openMinute,
        closeMinute: input.store.closeMinute,
        deliveryRadiusKm: input.store.deliveryRadiusKm,
        serviceAreas: { create: [...new Set(input.store.serviceLocalityIds)].map((localityId) => ({ localityId })) },
        priceLists: {
          create: [
            { name: 'Retail', type: 'RETAIL', taxInclusive: true },
            { name: 'Wholesale', type: 'WHOLESALE', taxInclusive: false },
          ],
        },
      },
    });
    await tx.userRole.upsert({ where: { userId_role: { userId, role: 'SELLER' } }, create: { userId, role: 'SELLER' }, update: {} });
    return { ...org, storeId: store.id };
  });
  await audit(req, 'SELLER_APPLIED', 'SellerOrg', org.id, { sellerType: input.sellerType });
  const admins = await prisma.userRole.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } }, select: { userId: true } });
  await notify(admins.map((a) => a.userId), { type: 'SELLER_APPLICATION', title: `New seller application: ${input.orgName}`, body: 'Review documents and approve or reject.', data: { sellerOrgId: org.id } });
  res.status(201).json({ sellerOrg: org });
});

sellerRouter.get('/me', async (req, res) => {
  const memberships = await prisma.sellerMember.findMany({
    where: { userId: authOf(req).user.id },
    include: {
      sellerOrg: {
        include: {
          stores: { include: { locality: { select: { name: true, cityId: true } } } },
          licences: true,
          documents: { select: { id: true, type: true, status: true, createdAt: true, fileId: true } },
        },
      },
    },
  });
  res.json({ memberships: memberships.map((m) => ({ role: m.role, pharmacistRegNumber: m.pharmacistRegNumber, org: m.sellerOrg })) });
});

sellerRouter.post('/orgs/:orgId/documents', upload.single('file'), async (req, res) => {
  const { type } = parse(z.object({ type: z.enum(DOCUMENT_TYPES) }), req.body);
  const auth = authOf(req);
  const member = await prisma.sellerMember.findUnique({ where: { userId_sellerOrgId: { userId: auth.user.id, sellerOrgId: String(req.params.orgId) } } });
  if (!member || !['OWNER', 'MANAGER'].includes(member.role)) throw forbidden();
  const file = await saveUpload(req.file, auth.user.id, 'VERIFICATION');
  const doc = await prisma.verificationDocument.create({ data: { type, fileId: file.id, sellerOrgId: String(req.params.orgId) } });
  await prisma.sellerOrg.updateMany({ where: { id: String(req.params.orgId), verificationStatus: 'INFO_REQUIRED' }, data: { verificationStatus: 'PENDING' } });
  res.status(201).json({ document: doc });
});

// ── Store settings ──
sellerRouter.patch('/stores/:storeId', async (req, res) => {
  const input = parse(storeSettingsSchema, req.body);
  await requireStoreMember(req, String(req.params.storeId), ['OWNER', 'MANAGER']);
  const store = await prisma.store.update({ where: { id: String(req.params.storeId) }, data: input });
  await audit(req, 'STORE_SETTINGS_UPDATED', 'Store', store.id, input);
  res.json({ store });
});

// ── Orders ──
const sellerOrderQuery = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  scope: z.enum(['new', 'active', 'completed', 'all']).default('active'),
  page: z.coerce.number().int().min(1).default(1),
});

sellerRouter.get('/stores/:storeId/orders', async (req, res) => {
  await requireStoreMember(req, String(req.params.storeId));
  const q = parse(sellerOrderQuery, req.query);
  const statusFilter: Prisma.OrderWhereInput =
    q.status != null
      ? { status: q.status }
      : q.scope === 'new'
        ? { status: { in: ['PLACED', 'AWAITING_RX_REVIEW'] } }
        : q.scope === 'active'
          ? { status: { in: ['PLACED', 'AWAITING_RX_REVIEW', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED'] } }
          : q.scope === 'completed'
            ? { status: { in: ['DELIVERED', 'CANCELLED', 'REJECTED'] } }
            : { status: { not: 'PENDING_PAYMENT' } };
  const where = { storeId: String(req.params.storeId), ...statusFilter };
  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { placedAt: 'desc' },
      skip: (q.page - 1) * 25,
      take: 25,
      include: { _count: { select: { items: true } }, delivery: { where: { status: { not: 'CANCELLED' } }, select: { status: true, deliveryPartner: { select: { user: { select: { name: true } } } } } } },
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
      fulfilmentType: o.fulfilmentType,
      channel: o.channel,
      grandTotal: o.grandTotal,
      itemCount: o._count.items,
      placedAt: o.placedAt,
      scheduledFor: o.scheduledFor,
      delivery: o.delivery[0] ? { status: o.delivery[0].status, partnerName: o.delivery[0].deliveryPartner.user.name } : null,
    })),
  });
});

async function sellerOrder(req: Request, orderId: string) {
  const order = await loadFullOrder(orderId);
  if (!order) throw notFound('Order');
  const { member, store } = await requireStoreMember(req, order.storeId);
  return { order, member, store };
}

sellerRouter.get('/orders/:id', async (req, res) => {
  const { order, member } = await sellerOrder(req, String(req.params.id));
  const view = await orderView(order, 'SELLER');
  // Pharmacists reviewing a prescription order need the prescription file reference.
  const rx =
    order.prescriptionId && member.role === 'PHARMACIST'
      ? await prisma.prescription.findUnique({ where: { id: order.prescriptionId }, select: { id: true, fileId: true, patientName: true, doctorName: true, issuedOn: true, status: true } })
      : null;
  res.json({ order: { ...view, prescriptionDetails: rx }, memberRole: member.role });
});

sellerRouter.post('/orders/:id/transition', async (req, res) => {
  const { to, reason } = parse(orderTransitionSchema, req.body);
  const { order } = await sellerOrder(req, String(req.params.id));
  if (order.status === 'AWAITING_RX_REVIEW' && to !== 'REJECTED') throw conflict('RX_REVIEW_REQUIRED', 'A pharmacist must review the prescription first');
  if ((to === 'REJECTED' || to === 'CANCELLED') && !reason) throw new AppError(400, 'VALIDATION_ERROR', 'Give a reason', { fields: { reason: 'Required' } });
  await transitionOrder({ orderId: order.id, to, actor: 'SELLER', actorUserId: authOf(req).user.id, note: reason });
  res.json({ order: await orderView((await loadFullOrder(order.id))!, 'SELLER') });
});

sellerRouter.get('/stores/:storeId/delivery-partners', async (req, res) => {
  const { store } = await requireStoreMember(req, String(req.params.storeId));
  const locality = await prisma.locality.findUniqueOrThrow({ where: { id: store.localityId } });
  res.json({ partners: await availablePartners(locality.cityId) });
});

sellerRouter.post('/orders/:id/assign', async (req, res) => {
  const { deliveryPartnerId } = parse(assignDeliverySchema, req.body);
  const { order } = await sellerOrder(req, String(req.params.id));
  await assignDelivery(order.id, deliveryPartnerId, authOf(req).user.id);
  res.json({ order: await orderView((await loadFullOrder(order.id))!, 'SELLER') });
});

/**
 * Pharmacist review of the prescription attached to an order. Only a seller member with the
 * PHARMACIST role may decide; every decision is recorded and audited.
 */
sellerRouter.post('/orders/:id/prescription-review', async (req, res) => {
  const input = parse(prescriptionReviewSchema, req.body);
  const auth = authOf(req);
  const { order, member, store } = await sellerOrder(req, String(req.params.id));
  if (member.role !== 'PHARMACIST') throw forbidden('Only a registered pharmacist can review prescriptions');
  if (order.status !== 'AWAITING_RX_REVIEW' || !order.prescriptionId) throw conflict('NOT_AWAITING_REVIEW', 'This order is not awaiting prescription review');

  const rxProductIds = await prisma.productVariant.findMany({ where: { id: { in: order.items.filter((i) => i.requiresPrescription).map((i) => i.variantId) } }, select: { productId: true } });
  const needed = new Set(rxProductIds.map((v) => v.productId));
  if (input.decision === 'APPROVED') {
    const missing = [...needed].filter((p) => !input.approvedProductIds.includes(p));
    if (missing.length) throw new AppError(400, 'INCOMPLETE_APPROVAL', 'Approve every prescription item in the order, or reject the order', { missingProductIds: missing });
  }

  await prisma.$transaction(async (tx) => {
    await tx.prescriptionReview.create({
      data: { prescriptionId: order.prescriptionId!, reviewerUserId: auth.user.id, storeId: store.id, decision: input.decision, notes: input.notes, isSimulated: store.isDemo },
    });
    await tx.prescription.update({
      where: { id: order.prescriptionId! },
      data: { status: input.decision, validUntil: input.validUntil ? new Date(input.validUntil) : undefined },
    });
    if (input.decision === 'APPROVED') {
      for (const productId of needed) {
        await tx.prescriptionApprovedItem.upsert({ where: { prescriptionId_productId: { prescriptionId: order.prescriptionId!, productId } }, create: { prescriptionId: order.prescriptionId!, productId }, update: {} });
      }
    }
    await audit(req, `PRESCRIPTION_${input.decision}`, 'Prescription', order.prescriptionId!, { orderId: order.id, pharmacistRegNumber: member.pharmacistRegNumber }, tx);
  });

  const next = input.decision === 'REJECTED' ? 'REJECTED' : ['UPI', 'CARD', 'NETBANKING'].includes(order.paymentMethod) ? 'PENDING_PAYMENT' : 'PLACED';
  await transitionOrder({
    orderId: order.id,
    to: next,
    actor: 'SELLER',
    actorUserId: auth.user.id,
    note: input.decision === 'REJECTED' ? `Prescription rejected: ${input.notes}` : 'Prescription approved by pharmacist',
  });
  res.json({ order: await orderView((await loadFullOrder(order.id))!, 'SELLER') });
});

// ── Inventory & products ──
sellerRouter.get('/stores/:storeId/inventory', async (req, res) => {
  await requireStoreMember(req, String(req.params.storeId));
  const q = parse(z.object({ q: z.string().optional(), filter: z.enum(['all', 'low', 'out', 'expiring']).default('all') }), req.query);
  const storeId = String(req.params.storeId);
  const soon = new Date(Date.now() + 30 * 86400_000);
  const items = await prisma.storeInventory.findMany({
    where: {
      storeId,
      ...(q.q ? { OR: [{ variant: { sku: { contains: q.q, mode: 'insensitive' } } }, { variant: { product: { name: { contains: q.q, mode: 'insensitive' } } } }] } : {}),
      ...(q.filter === 'out' ? { stockQty: 0 } : {}),
      ...(q.filter === 'expiring' ? { expiryDate: { lte: soon } } : {}),
    },
    include: { variant: { include: { product: { include: { category: { select: { name: true } } } } } } },
    orderBy: { variant: { product: { name: 'asc' } } },
  });
  const lists = await prisma.priceList.findMany({ where: { storeId, type: { in: ['RETAIL', 'WHOLESALE'] }, businessProfileId: null }, include: { items: true } });
  const retail = new Map(lists.find((l) => l.type === 'RETAIL')?.items.map((i) => [i.variantId, i]) ?? []);
  const wholesale = new Map(lists.find((l) => l.type === 'WHOLESALE')?.items.map((i) => [i.variantId, i]) ?? []);
  const rows = items
    .map((i) => ({
      id: i.id,
      variantId: i.variantId,
      sku: i.variant.sku,
      productName: i.variant.product.name,
      variantName: i.variant.name,
      category: i.variant.product.category.name,
      vertical: i.variant.product.vertical,
      mrp: i.variant.mrp,
      price: retail.get(i.variantId)?.unitPrice ?? null,
      wholesalePrice: wholesale.get(i.variantId)?.unitPrice ?? null,
      minOrderQty: wholesale.get(i.variantId)?.minOrderQty ?? retail.get(i.variantId)?.minOrderQty ?? 1,
      stockQty: i.stockQty,
      lowStockThreshold: i.lowStockThreshold,
      isAvailable: i.isAvailable,
      batchNumber: i.batchNumber,
      expiryDate: i.expiryDate,
      requiresPrescription: i.variant.product.requiresPrescription,
      productActive: i.variant.product.isActive,
    }))
    .filter((r) => (q.filter === 'low' ? r.stockQty > 0 && r.stockQty <= r.lowStockThreshold : true));
  res.json({ items: rows });
});

async function upsertPrice(tx: Prisma.TransactionClient, storeId: string, type: 'RETAIL' | 'WHOLESALE', variantId: string, unitPrice: number | null, minOrderQty?: number) {
  let list = await tx.priceList.findFirst({ where: { storeId, type, businessProfileId: null } });
  if (!list) list = await tx.priceList.create({ data: { storeId, type, name: type === 'RETAIL' ? 'Retail' : 'Wholesale', taxInclusive: type === 'RETAIL' } });
  if (unitPrice == null) {
    await tx.priceListItem.deleteMany({ where: { priceListId: list.id, variantId } });
    return;
  }
  await tx.priceListItem.upsert({
    where: { priceListId_variantId: { priceListId: list.id, variantId } },
    create: { priceListId: list.id, variantId, unitPrice, minOrderQty: minOrderQty ?? 1 },
    update: { unitPrice, ...(minOrderQty ? { minOrderQty } : {}) },
  });
}

sellerRouter.patch('/stores/:storeId/inventory/:inventoryId', async (req, res) => {
  const input = parse(inventoryUpdateSchema, req.body);
  const { store } = await requireStoreMember(req, String(req.params.storeId), ['OWNER', 'MANAGER', 'PHARMACIST', 'STAFF']);
  const inv = await prisma.storeInventory.findFirst({ where: { id: String(req.params.inventoryId), storeId: store.id }, include: { variant: true } });
  if (!inv) throw notFound('Inventory item');
  const userId = authOf(req).user.id;
  if (input.price != null && input.price > inv.variant.mrp) throw new AppError(400, 'VALIDATION_ERROR', 'Selling price cannot exceed MRP', { fields: { price: 'Must be at most MRP' } });
  await prisma.$transaction(async (tx) => {
    const delta = input.stockQty != null ? input.stockQty - inv.stockQty : input.adjustBy ?? 0;
    if (delta !== 0) {
      const r = await adjustStock(tx, { storeId: store.id, variantId: inv.variantId, delta, reason: 'MANUAL_ADJUSTMENT', actorUserId: userId, note: input.reason });
      if (!r) throw new AppError(400, 'VALIDATION_ERROR', 'Stock cannot go below zero');
    }
    await tx.storeInventory.update({
      where: { id: inv.id },
      data: {
        lowStockThreshold: input.lowStockThreshold,
        isAvailable: input.isAvailable,
        batchNumber: input.batchNumber,
        expiryDate: input.expiryDate === undefined ? undefined : input.expiryDate ? new Date(input.expiryDate) : null,
      },
    });
    if (input.price != null) await upsertPrice(tx, store.id, 'RETAIL', inv.variantId, input.price);
    if (input.wholesalePrice !== undefined) await upsertPrice(tx, store.id, 'WHOLESALE', inv.variantId, input.wholesalePrice, input.minOrderQty);
  });
  res.json({ ok: true });
});

sellerRouter.get('/stores/:storeId/inventory/:inventoryId/history', async (req, res) => {
  await requireStoreMember(req, String(req.params.storeId));
  const logs = await prisma.inventoryAuditLog.findMany({ where: { inventoryId: String(req.params.inventoryId), inventory: { storeId: String(req.params.storeId) } }, orderBy: { createdAt: 'desc' }, take: 50 });
  res.json({ history: logs });
});

sellerRouter.get('/categories', async (_req, res) => {
  res.json({ categories: await prisma.category.findMany({ where: { isActive: true }, orderBy: [{ vertical: 'asc' }, { sortOrder: 'asc' }], select: { id: true, name: true, vertical: true, parentId: true } }) });
});

sellerRouter.post('/stores/:storeId/products', async (req, res) => {
  const input = parse(productCreateSchema, req.body);
  const { store } = await requireStoreMember(req, String(req.params.storeId), ['OWNER', 'MANAGER', 'PHARMACIST']);
  const org = await prisma.sellerOrg.findUniqueOrThrow({ where: { id: store.sellerOrgId }, include: { licences: true } });
  if (!store.verticals.includes(input.vertical)) throw new AppError(400, 'VALIDATION_ERROR', `This store is not set up for ${input.vertical}`);
  const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
  if (!category || category.vertical !== input.vertical) throw new AppError(400, 'VALIDATION_ERROR', 'Pick a category from the same vertical', { fields: { categoryId: 'Invalid category' } });
  if (input.vertical === 'CHEMIST') {
    if (org.sellerType !== 'PHARMACY' || !org.licences.some((l) => l.type === 'DRUG_LICENCE' && l.status === 'APPROVED'))
      throw forbidden('Only pharmacies with an approved drug licence can list medicines');
    if (!input.pharmacy) throw new AppError(400, 'VALIDATION_ERROR', 'Medicines need schedule and composition details', { fields: { pharmacy: 'Required' } });
    if (input.pharmacy.schedule === 'SCHEDULE_X') throw forbidden('Schedule X medicines cannot be sold on this platform');
  }
  if (input.inventory.price > input.variant.mrp) throw new AppError(400, 'VALIDATION_ERROR', 'Selling price cannot exceed MRP', { fields: { 'inventory.price': 'Must be at most MRP' } });
  const userId = authOf(req).user.id;

  const created = await prisma.$transaction(async (tx) => {
    const brand = input.brandName
      ? await tx.brand.upsert({ where: { name: input.brandName }, create: { name: input.brandName, slug: `${slugify(input.brandName)}-${uniqueSuffix()}` }, update: {} })
      : null;
    const schedule = input.pharmacy?.schedule ?? null;
    const product = await tx.product.create({
      data: {
        name: input.name,
        slug: `${slugify(input.name)}-${uniqueSuffix()}`,
        brandId: brand?.id,
        categoryId: category.id,
        vertical: input.vertical,
        description: input.description ?? null,
        localNames: input.localNames.map((n) => n.toLowerCase()),
        taxRateBps: input.taxRateBps,
        hsnCode: input.hsnCode ?? null,
        isRegional: input.isRegional,
        regionalCityId: input.isRegional ? (await tx.locality.findUniqueOrThrow({ where: { id: store.localityId } })).cityId : null,
        isDemo: store.isDemo,
        schedule,
        requiresPrescription: schedule === 'SCHEDULE_H' || schedule === 'SCHEDULE_H1',
        genericName: input.pharmacy?.genericName ?? null,
        strength: input.pharmacy?.strength ?? null,
        dosageForm: input.pharmacy?.dosageForm ?? null,
        manufacturer: input.pharmacy?.manufacturer ?? null,
        variants: {
          create: {
            sku: input.variant.sku,
            name: input.variant.name,
            unitType: input.variant.unitType,
            unitQuantity: input.variant.unitQuantity,
            mrp: input.variant.mrp,
            unitsPerCase: input.variant.unitsPerCase ?? null,
            isBulk: ['CASE', 'CARTON', 'BOX'].includes(input.variant.unitType),
          },
        },
      },
      include: { variants: true },
    });
    const variant = product.variants[0];
    await tx.storeInventory.create({ data: { storeId: store.id, variantId: variant.id, stockQty: 0, lowStockThreshold: input.inventory.lowStockThreshold } });
    if (input.inventory.stockQty > 0) await adjustStock(tx, { storeId: store.id, variantId: variant.id, delta: input.inventory.stockQty, reason: 'INITIAL', actorUserId: userId });
    await upsertPrice(tx, store.id, 'RETAIL', variant.id, input.inventory.price, input.vertical === 'HORECA' ? input.inventory.minOrderQty : 1);
    if (input.inventory.wholesalePrice) await upsertPrice(tx, store.id, 'WHOLESALE', variant.id, input.inventory.wholesalePrice, input.inventory.minOrderQty);
    return product;
  });
  await audit(req, 'PRODUCT_CREATED', 'Product', created.id, { storeId: store.id, sku: input.variant.sku });
  res.status(201).json({ product: created });
});

const CSV_HEADER = ['sku', 'price_rupees', 'stock_qty', 'low_stock_threshold', 'is_available', 'wholesale_price_rupees', 'min_order_qty', 'batch_number', 'expiry_date'];

sellerRouter.get('/stores/:storeId/inventory.csv', async (req, res) => {
  await requireStoreMember(req, String(req.params.storeId));
  const storeId = String(req.params.storeId);
  const inv = await prisma.storeInventory.findMany({ where: { storeId }, include: { variant: true } });
  const lists = await prisma.priceList.findMany({ where: { storeId, businessProfileId: null }, include: { items: true } });
  const price = (type: string, v: string) => lists.find((l) => l.type === type)?.items.find((i) => i.variantId === v);
  const rows = inv.map((i) => [
    i.variant.sku,
    price('RETAIL', i.variantId) ? (price('RETAIL', i.variantId)!.unitPrice / 100).toFixed(2) : '',
    i.stockQty,
    i.lowStockThreshold,
    i.isAvailable,
    price('WHOLESALE', i.variantId) ? (price('WHOLESALE', i.variantId)!.unitPrice / 100).toFixed(2) : '',
    price('WHOLESALE', i.variantId)?.minOrderQty ?? '',
    i.batchNumber ?? '',
    i.expiryDate ? i.expiryDate.toISOString().slice(0, 10) : '',
  ]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="inventory.csv"');
  res.send(toCsv([CSV_HEADER, ...rows]));
});

/**
 * Bulk stock/price update by SKU. SKUs must already exist in the platform catalogue; new products
 * are created through the product form so they get categories, tax rates and compliance checks.
 */
sellerRouter.post('/stores/:storeId/inventory/import', async (req, res) => {
  const { csv } = parse(z.object({ csv: z.string().min(1).max(500_000) }), req.body);
  const { store } = await requireStoreMember(req, String(req.params.storeId), ['OWNER', 'MANAGER']);
  const userId = authOf(req).user.id;
  const rows = parseCsv(csv);
  const header = rows.shift()?.map((h) => h.trim().toLowerCase()) ?? [];
  if (!header.includes('sku')) throw new AppError(400, 'CSV_INVALID', `The first row must be the header: ${CSV_HEADER.join(',')}`);
  if (rows.length > 2000) throw new AppError(400, 'CSV_TOO_LARGE', 'Import at most 2,000 rows at a time');
  const col = (r: string[], name: string) => {
    const i = header.indexOf(name);
    return i >= 0 ? r[i]?.trim() ?? '' : '';
  };
  const results: { row: number; sku: string; ok: boolean; message?: string }[] = [];
  for (const [idx, r] of rows.entries()) {
    const sku = col(r, 'sku');
    try {
      const variant = await prisma.productVariant.findUnique({ where: { sku }, include: { product: true } });
      if (!variant) throw new Error('SKU not found in catalogue');
      if (!store.verticals.includes(variant.product.vertical)) throw new Error(`Store does not sell ${variant.product.vertical}`);
      if (variant.product.isRestricted) throw new Error('Restricted product');
      const num = (name: string) => {
        const v = col(r, name);
        if (v === '') return undefined;
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number`);
        return n;
      };
      const price = num('price_rupees');
      const wholesale = num('wholesale_price_rupees');
      const stock = num('stock_qty');
      const low = num('low_stock_threshold');
      const moq = num('min_order_qty');
      const avail = col(r, 'is_available');
      const expiry = col(r, 'expiry_date');
      if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) throw new Error('expiry_date must be YYYY-MM-DD');
      if (price != null && Math.round(price * 100) > variant.mrp) throw new Error('price exceeds MRP');
      await prisma.$transaction(async (tx) => {
        const inv = await tx.storeInventory.upsert({
          where: { storeId_variantId: { storeId: store.id, variantId: variant.id } },
          create: { storeId: store.id, variantId: variant.id, stockQty: 0 },
          update: {},
        });
        if (stock != null && Math.round(stock) !== inv.stockQty) {
          await adjustStock(tx, { storeId: store.id, variantId: variant.id, delta: Math.round(stock) - inv.stockQty, reason: 'CSV_IMPORT', actorUserId: userId });
        }
        await tx.storeInventory.update({
          where: { id: inv.id },
          data: {
            lowStockThreshold: low != null ? Math.round(low) : undefined,
            isAvailable: avail ? ['true', 'yes', '1'].includes(avail.toLowerCase()) : undefined,
            batchNumber: col(r, 'batch_number') || undefined,
            expiryDate: expiry ? new Date(expiry) : undefined,
          },
        });
        if (price != null) await upsertPrice(tx, store.id, 'RETAIL', variant.id, Math.round(price * 100));
        if (wholesale != null) await upsertPrice(tx, store.id, 'WHOLESALE', variant.id, Math.round(wholesale * 100), moq != null ? Math.max(1, Math.round(moq)) : undefined);
      });
      results.push({ row: idx + 2, sku, ok: true });
    } catch (e) {
      results.push({ row: idx + 2, sku, ok: false, message: (e as Error).message });
    }
  }
  await audit(req, 'INVENTORY_CSV_IMPORT', 'Store', store.id, { rows: rows.length, failed: results.filter((r) => !r.ok).length });
  res.json({ imported: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results });
});

// ── Analytics ──
sellerRouter.get('/stores/:storeId/analytics', async (req, res) => {
  const { store } = await requireStoreMember(req, String(req.params.storeId));
  const { days } = parse(z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }), req.query);
  const since = new Date(Date.now() - days * 86400_000);
  const base = { storeId: store.id, placedAt: { gte: since }, status: { not: 'PENDING_PAYMENT' as const } };
  const [byStatus, delivered, best, outOfStock, lowStock, returns, commissions, unsettled] = await Promise.all([
    prisma.order.groupBy({ by: ['status'], where: base, _count: true }),
    prisma.order.aggregate({ where: { ...base, status: 'DELIVERED' }, _sum: { itemsSubtotal: true, grandTotal: true }, _count: true }),
    prisma.orderItem.groupBy({
      by: ['variantId', 'productName', 'variantName'],
      where: { order: { ...base, status: { notIn: ['CANCELLED', 'REJECTED', 'PENDING_PAYMENT'] } } },
      _sum: { quantity: true, netAmount: true },
      orderBy: { _sum: { netAmount: 'desc' } },
      take: 5,
    }),
    prisma.storeInventory.findMany({ where: { storeId: store.id, stockQty: 0, isAvailable: true }, include: { variant: { include: { product: { select: { name: true } } } } }, take: 20 }),
    prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM "StoreInventory" WHERE "storeId" = ${store.id} AND "stockQty" > 0 AND "stockQty" <= "lowStockThreshold"`,
    prisma.returnRequest.count({ where: { order: { storeId: store.id }, createdAt: { gte: since } } }),
    prisma.commissionEntry.aggregate({ where: { order: { storeId: store.id }, createdAt: { gte: since } }, _sum: { sellerEarning: true, commissionAmount: true } }),
    prisma.commissionEntry.aggregate({ where: { order: { storeId: store.id }, settlementId: null }, _sum: { sellerEarning: true } }),
  ]);
  const count = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
  const total = byStatus.reduce((s, b) => s + b._count, 0);
  // Acceptance rate: of the orders the store decided on, how many it accepted.
  const accepted = await prisma.orderStatusEvent.count({ where: { toStatus: 'ACCEPTED', order: base } });
  const rejected = count('REJECTED');
  const decided = accepted + rejected;
  const closed = count('DELIVERED') + count('CANCELLED') + count('REJECTED');
  res.json({
    periodDays: days,
    totalSales: delivered._sum.itemsSubtotal ?? 0,
    totalOrders: total,
    deliveredOrders: delivered._count,
    averageOrderValue: delivered._count ? Math.round((delivered._sum.grandTotal ?? 0) / delivered._count) : 0,
    ordersByStatus: Object.fromEntries(byStatus.map((b) => [b.status, b._count])),
    acceptanceRate: decided > 0 ? accepted / decided : null,
    fulfilmentRate: closed > 0 ? count('DELIVERED') / closed : null,
    cancellations: count('CANCELLED'),
    rejections: rejected,
    returns,
    bestSellers: best.map((b) => ({ variantId: b.variantId, name: `${b.productName} (${b.variantName})`, quantity: b._sum.quantity ?? 0, sales: b._sum.netAmount ?? 0 })),
    outOfStock: outOfStock.map((i) => ({ inventoryId: i.id, name: `${i.variant.product.name} (${i.variant.name})`, sku: i.variant.sku })),
    lowStockCount: Number(lowStock[0]?.count ?? 0),
    estimatedEarnings: commissions._sum.sellerEarning ?? 0,
    commissionPaid: commissions._sum.commissionAmount ?? 0,
    pendingSettlement: unsettled._sum.sellerEarning ?? 0,
  });
});

sellerRouter.get('/orgs/:orgId/settlements', async (req, res) => {
  const member = await prisma.sellerMember.findUnique({ where: { userId_sellerOrgId: { userId: authOf(req).user.id, sellerOrgId: String(req.params.orgId) } } });
  if (!member || !['OWNER', 'MANAGER'].includes(member.role)) throw forbidden();
  const [settlements, unsettled] = await Promise.all([
    prisma.settlement.findMany({ where: { sellerOrgId: String(req.params.orgId) }, orderBy: { createdAt: 'desc' } }),
    prisma.commissionEntry.aggregate({ where: { sellerOrgId: String(req.params.orgId), settlementId: null }, _sum: { saleAmount: true, commissionAmount: true, sellerEarning: true }, _count: true }),
  ]);
  res.json({ settlements, unsettled: { orders: unsettled._count, sales: unsettled._sum.saleAmount ?? 0, commission: unsettled._sum.commissionAmount ?? 0, earning: unsettled._sum.sellerEarning ?? 0 } });
});

// ── Returns ──
sellerRouter.get('/stores/:storeId/returns', async (req, res) => {
  await requireStoreMember(req, String(req.params.storeId));
  const list = await prisma.returnRequest.findMany({ where: { order: { storeId: String(req.params.storeId) } }, orderBy: { createdAt: 'desc' }, include: { order: { select: { orderNumber: true, id: true } } } });
  res.json({ returns: list });
});

// ── RFQs & quotations (HoReCa suppliers) ──
sellerRouter.get('/stores/:storeId/rfqs', async (req, res) => {
  const { store } = await requireStoreMember(req, String(req.params.storeId));
  if (!store.verticals.includes('HORECA')) return res.json({ rfqs: [] });
  const served = await prisma.storeServiceLocality.findMany({ where: { storeId: store.id }, select: { localityId: true } });
  const rfqs = await prisma.rfq.findMany({
    where: { status: { in: ['OPEN', 'QUOTED'] }, deliveryLocalityId: { in: served.map((s) => s.localityId) } },
    orderBy: { createdAt: 'desc' },
    include: {
      items: { include: { variant: { select: { sku: true, name: true, product: { select: { name: true, taxRateBps: true } } } } } },
      businessProfile: { select: { businessName: true, businessType: true } },
      deliveryLocality: { select: { name: true } },
      quotations: { where: { storeId: store.id }, include: { items: true } },
    },
  });
  res.json({ rfqs });
});

sellerRouter.post('/rfqs/:id/quotations', async (req, res) => {
  const input = parse(quotationCreateSchema, req.body);
  const { store } = await requireStoreMember(req, input.storeId, ['OWNER', 'MANAGER']);
  if (!store.verticals.includes('HORECA')) throw forbidden('Only HoReCa suppliers can quote');
  const rfq = await prisma.rfq.findUnique({ where: { id: String(req.params.id) }, include: { items: true } });
  if (!rfq || !['OPEN', 'QUOTED'].includes(rfq.status)) throw notFound('Open RFQ');
  const served = await prisma.storeServiceLocality.findUnique({ where: { storeId_localityId: { storeId: store.id, localityId: rfq.deliveryLocalityId } } });
  if (!served) throw forbidden('This store does not deliver to the RFQ location');
  if (new Date(input.validUntil) <= new Date()) throw new AppError(400, 'VALIDATION_ERROR', 'Validity must be in the future', { fields: { validUntil: 'Must be in the future' } });

  let subtotal = 0;
  let taxTotal = 0;
  for (const qi of input.items) {
    const item = rfq.items.find((i) => i.id === qi.rfqItemId);
    if (!item) throw new AppError(400, 'VALIDATION_ERROR', 'Quotation refers to an unknown RFQ line');
    if (!qi.available) continue;
    const line = Math.round(qi.unitPrice * Number(item.quantity));
    subtotal += line;
    taxTotal += exclusiveTax(line, qi.taxRateBps);
  }
  const quotation = await prisma.$transaction(async (tx) => {
    await tx.quotation.deleteMany({ where: { rfqId: rfq.id, storeId: store.id, status: 'SUBMITTED' } });
    const q = await tx.quotation.create({
      data: {
        rfqId: rfq.id,
        storeId: store.id,
        sellerOrgId: store.sellerOrgId,
        validUntil: new Date(input.validUntil),
        deliveryFee: input.deliveryFee,
        notes: input.notes ?? null,
        subtotal,
        taxTotal,
        grandTotal: subtotal + taxTotal + input.deliveryFee,
        items: { create: input.items.map((i) => ({ rfqItemId: i.rfqItemId, variantId: i.variantId ?? rfq.items.find((x) => x.id === i.rfqItemId)?.variantId ?? null, unitPrice: i.unitPrice, taxRateBps: i.taxRateBps, available: i.available })) },
      },
    });
    await tx.rfq.update({ where: { id: rfq.id }, data: { status: 'QUOTED' } });
    return q;
  });
  await notify(rfq.userId, { type: 'RFQ_QUOTED', title: `New quotation for ${rfq.rfqNumber}`, body: `${store.name} sent a quotation. Compare and accept it from your RFQ page.`, data: { rfqId: rfq.id } });
  res.status(201).json({ quotation });
});
