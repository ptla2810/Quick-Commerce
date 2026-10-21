import { Router, type Request } from 'express';
import { z } from 'zod';
import { VERTICALS } from '@padosi/shared';
import { prisma } from '../lib/prisma';
import { notFound, parse } from '../lib/errors';
import { listProducts } from '../services/catalog';
import { publicStore, serviceableStores, storeIsOpen, type StoreAvailability } from '../services/serviceability';
import { approvedBusinessProfileId, type Buyer } from '../services/pricing';
import { locationQuery } from './locations';

export const catalogRouter = Router();

const listQuery = locationQuery.extend({
  category: z.string().optional(),
  brand: z.string().optional(),
  q: z.string().trim().max(80).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  inStock: z.enum(['true', 'false']).optional(),
  regional: z.enum(['true', 'false']).optional(),
  bulk: z.enum(['true', 'false']).optional(),
  maxEta: z.coerce.number().int().min(5).optional(),
  sort: z.enum(['relevance', 'price_asc', 'price_desc', 'rating', 'eta']).optional(),
  storeId: z.string().optional(),
  mode: z.enum(['RETAIL', 'BUSINESS']).default('RETAIL'),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

async function buyerFor(req: Request, mode: 'RETAIL' | 'BUSINESS'): Promise<Buyer> {
  if (mode === 'BUSINESS' && req.auth) {
    const bp = await approvedBusinessProfileId(req.auth.user.id);
    if (bp) return { channel: 'BUSINESS', businessProfileId: bp };
  }
  return { channel: 'RETAIL' };
}

catalogRouter.get('/categories', async (req, res) => {
  const { vertical } = parse(z.object({ vertical: z.enum(VERTICALS).optional() }), req.query);
  const categories = await prisma.category.findMany({
    where: { isActive: true, parentId: null, ...(vertical ? { vertical } : {}) },
    include: { children: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
    orderBy: [{ vertical: 'asc' }, { sortOrder: 'asc' }],
  });
  res.json({ categories });
});

catalogRouter.get('/brands', async (_req, res) => {
  res.json({ brands: await prisma.brand.findMany({ orderBy: { name: 'asc' } }) });
});

catalogRouter.get('/products', async (req, res) => {
  const q = parse(listQuery, req.query);
  let stores = await serviceableStores(q, q.vertical);
  if (q.storeId) stores = stores.filter((s) => s.store.id === q.storeId);
  const result = await listProducts(stores, await buyerFor(req, q.mode), {
    vertical: q.vertical,
    excludeHoreca: q.mode === 'RETAIL' && !q.category && !q.storeId,
    categorySlug: q.category,
    brandSlug: q.brand,
    q: q.q,
    minPrice: q.minPrice,
    maxPrice: q.maxPrice,
    inStockOnly: q.inStock === 'true',
    regionalOnly: q.regional === 'true',
    bulkOnly: q.bulk === 'true',
    maxEtaMins: q.maxEta,
    sort: q.sort,
    page: q.page,
    pageSize: q.pageSize,
  });
  res.json({ ...result, serviceable: stores.length > 0 });
});

catalogRouter.get('/products/:slug', async (req, res) => {
  const q = parse(locationQuery.partial({ localityId: true }).extend({ mode: z.enum(['RETAIL', 'BUSINESS']).default('RETAIL') }), req.query);
  const product = await prisma.product.findFirst({
    where: { slug: String(req.params.slug), isActive: true, isRestricted: false },
    include: { brand: true, category: true },
  });
  if (!product) throw notFound('Product');
  let card = null;
  if (q.localityId) {
    const stores = await serviceableStores({ localityId: q.localityId, lat: q.lat, lng: q.lng });
    const r = await listProducts(stores, await buyerFor(req, q.mode), { productIds: [product.id], pageSize: 1 });
    card = r.items[0] ?? null;
  }
  const rating = await prisma.review.aggregate({ where: { productId: product.id }, _avg: { rating: true }, _count: true });
  const favourite = req.auth ? !!(await prisma.favouriteProduct.findUnique({ where: { userId_productId: { userId: req.auth.user.id, productId: product.id } } })) : false;
  res.json({
    product: {
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      brand: product.brand,
      category: product.category,
      vertical: product.vertical,
      imageUrl: product.imageUrl,
      isDemo: product.isDemo,
      isRegional: product.isRegional,
      taxRateBps: product.taxRateBps,
      requiresPrescription: product.requiresPrescription,
      schedule: product.schedule,
      genericName: product.genericName,
      strength: product.strength,
      dosageForm: product.dosageForm,
      manufacturer: product.manufacturer,
    },
    availability: card,
    rating: { average: rating._avg.rating, count: rating._count },
    favourite,
  });
});

/** Frequently and recently ordered products for the signed-in user, limited to what is deliverable now. */
catalogRouter.get('/recommendations', async (req, res) => {
  const q = parse(locationQuery, req.query);
  const stores = await serviceableStores(q, q.vertical);
  const buyer = await buyerFor(req, 'RETAIL');
  let frequent: string[] = [];
  let recent: string[] = [];
  if (req.auth) {
    const rows = await prisma.orderItem.groupBy({
      by: ['variantId'],
      where: { order: { userId: req.auth.user.id, status: { notIn: ['CANCELLED', 'REJECTED'] } } },
      _count: { variantId: true },
      orderBy: { _count: { variantId: 'desc' } },
      take: 20,
    });
    const variants = await prisma.productVariant.findMany({ where: { id: { in: rows.map((r) => r.variantId) } }, select: { id: true, productId: true } });
    const byVariant = new Map(variants.map((v) => [v.id, v.productId]));
    frequent = [...new Set(rows.map((r) => byVariant.get(r.variantId)!).filter(Boolean))];
    const lastItems = await prisma.orderItem.findMany({
      where: { order: { userId: req.auth.user.id } },
      orderBy: { order: { placedAt: 'desc' } },
      take: 30,
      select: { variant: { select: { productId: true } } },
    });
    recent = [...new Set(lastItems.map((i) => i.variant.productId))].slice(0, 12);
  }
  // Fallback for new customers: popular products across the platform.
  if (!frequent.length) {
    const popular = await prisma.orderItem.groupBy({ by: ['variantId'], _sum: { quantity: true }, orderBy: { _sum: { quantity: 'desc' } }, take: 20 });
    const variants = await prisma.productVariant.findMany({ where: { id: { in: popular.map((p) => p.variantId) } }, select: { productId: true } });
    frequent = [...new Set(variants.map((v) => v.productId))];
  }
  const load = async (ids: string[]) => {
    if (!ids.length) return [];
    const r = await listProducts(stores, buyer, { productIds: ids, vertical: q.vertical, excludeHoreca: !q.vertical, pageSize: 12 });
    const order = new Map(ids.map((id, i) => [id, i]));
    return r.items.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  };
  const regional = await listProducts(stores, buyer, { regionalOnly: true, vertical: q.vertical, excludeHoreca: !q.vertical, pageSize: 12 });
  res.json({ frequent: await load(frequent), recent: await load(recent), regional: regional.items, personalised: !!req.auth });
});

export const storesRouter = Router();

storesRouter.get('/nearby', async (req, res) => {
  const q = parse(locationQuery, req.query);
  const stores = await serviceableStores(q, q.vertical);
  res.json({ stores: stores.map(publicStore) });
});

storesRouter.get('/:slug', async (req, res) => {
  const q = parse(locationQuery.partial({ localityId: true }), req.query);
  const store = await prisma.store.findFirst({
    where: { slug: String(req.params.slug), isActive: true, sellerOrg: { verificationStatus: 'APPROVED' } },
    include: { locality: { include: { city: true } }, sellerOrg: { select: { name: true, sellerType: true, licences: { where: { status: 'APPROVED' }, select: { type: true, number: true, isSimulated: true } } } } },
  });
  if (!store) throw notFound('Store');
  let availability: StoreAvailability | null = null;
  if (q.localityId) availability = (await serviceableStores({ localityId: q.localityId, lat: q.lat, lng: q.lng })).find((s) => s.store.id === store.id) ?? null;
  const reviews = await prisma.review.findMany({ where: { storeId: store.id }, orderBy: { createdAt: 'desc' }, take: 5, include: { user: { select: { name: true } } } });
  const favourite = req.auth ? !!(await prisma.favouriteStore.findUnique({ where: { userId_storeId: { userId: req.auth.user.id, storeId: store.id } } })) : false;
  res.json({
    store: {
      ...publicStore(availability ?? { store, isOpen: storeIsOpen(store) }),
      locality: store.locality.name,
      city: store.locality.city.name,
      sellerName: store.sellerOrg.name,
      sellerType: store.sellerOrg.sellerType,
      licences: store.sellerOrg.licences,
    },
    deliversToSelectedLocation: q.localityId ? !!availability : null,
    reviews: reviews.map((r) => ({ id: r.id, rating: r.rating, comment: r.comment, author: r.user.name.split(' ')[0], createdAt: r.createdAt })),
    favourite,
  });
});
