import type { Prisma, Vertical } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { resolvePrices, unitPriceFor, type Buyer } from './pricing';
import type { StoreAvailability } from './serviceability';

export interface ProductQuery {
  vertical?: Vertical;
  /** Retail browsing hides the HoReCa bulk catalogue unless it is asked for explicitly. */
  excludeHoreca?: boolean;
  categorySlug?: string;
  brandSlug?: string;
  q?: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  regionalOnly?: boolean;
  bulkOnly?: boolean;
  maxEtaMins?: number;
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'rating' | 'eta';
  productIds?: string[];
  page?: number;
  pageSize?: number;
}

export interface Offer {
  storeId: string;
  storeName: string;
  storeSlug: string;
  isDemoStore: boolean;
  price: number;
  taxInclusive: boolean;
  priceSource: string;
  minOrderQty: number;
  tiers: { minQty: number; unitPrice: number }[];
  inStock: boolean;
  lowStock: boolean;
  stockLeft: number | null;
  isOpen: boolean;
  distanceKm: number;
  etaMinMins: number;
  etaMaxMins: number;
  storeRating: number;
}

function searchTokens(q: string) {
  return q
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((t) => t.length >= 2)
    .slice(0, 6);
}

async function categoryIdsFor(slug: string): Promise<string[]> {
  const root = await prisma.category.findUnique({ where: { slug }, include: { children: { select: { id: true } } } });
  if (!root) return [];
  return [root.id, ...root.children.map((c) => c.id)];
}

/**
 * Products purchasable from the given (already serviceability-checked) stores, with the best offer
 * per variant. Nothing is shown as available unless a serviceable store stocks and prices it.
 */
export async function listProducts(stores: StoreAvailability[], buyer: Buyer, query: ProductQuery) {
  const storeIds = stores.map((s) => s.store.id);
  const storeBy = new Map(stores.map((s) => [s.store.id, s]));
  if (!storeIds.length) return { items: [], total: 0, page: 1, pageSize: query.pageSize ?? 24 };

  const where: Prisma.ProductWhereInput = {
    isActive: true,
    isRestricted: false,
    variants: { some: { isActive: true, inventory: { some: { storeId: { in: storeIds }, isAvailable: true } } } },
  };
  const and: Prisma.ProductWhereInput[] = [];
  if (query.vertical) where.vertical = query.vertical;
  else if (query.excludeHoreca) where.vertical = { not: 'HORECA' };
  if (query.productIds) where.id = { in: query.productIds };
  if (query.regionalOnly) where.isRegional = true;
  if (query.categorySlug) where.categoryId = { in: await categoryIdsFor(query.categorySlug) };
  if (query.brandSlug) where.brand = { slug: query.brandSlug };
  if (query.bulkOnly) and.push({ variants: { some: { isBulk: true } } });
  const tokens = query.q ? searchTokens(query.q) : [];
  if (query.q && tokens.length) {
    // Every token must match somewhere: name, brand, category, generic name or a local term.
    for (const t of tokens) {
      and.push({
        OR: [
          { name: { contains: t, mode: 'insensitive' } },
          { brand: { name: { contains: t, mode: 'insensitive' } } },
          { category: { name: { contains: t, mode: 'insensitive' } } },
          { genericName: { contains: t, mode: 'insensitive' } },
          { localNames: { has: t } },
          { variants: { some: { sku: { equals: t, mode: 'insensitive' } } } },
        ],
      });
    }
  }
  if (and.length) where.AND = and;

  const products = await prisma.product.findMany({
    where,
    take: 500,
    include: {
      brand: true,
      category: { select: { id: true, name: true, slug: true, icon: true } },
      variants: {
        where: { isActive: true, ...(query.bulkOnly ? { isBulk: true } : {}) },
        orderBy: { mrp: 'asc' },
        include: { inventory: { where: { storeId: { in: storeIds }, isAvailable: true } } },
      },
    },
  });

  const variantIds = products.flatMap((p) => p.variants.map((v) => v.id));
  const prices = await resolvePrices(storeIds, variantIds, buyer);

  const cards = products
    .map((p) => {
      const variants = p.variants
        .map((v) => {
          const offers: Offer[] = [];
          for (const inv of v.inventory) {
            const price = prices.get(`${inv.storeId}:${v.id}`);
            const sa = storeBy.get(inv.storeId);
            if (!price || !sa) continue;
            const inStock = inv.stockQty >= price.minOrderQty;
            const lowStock = inStock && inv.stockQty <= inv.lowStockThreshold;
            offers.push({
              storeId: sa.store.id,
              storeName: sa.store.name,
              storeSlug: sa.store.slug,
              isDemoStore: sa.store.isDemo,
              price: unitPriceFor(price, price.minOrderQty),
              taxInclusive: price.taxInclusive,
              priceSource: price.source,
              minOrderQty: price.minOrderQty,
              tiers: price.tiers,
              inStock,
              lowStock,
              stockLeft: lowStock ? inv.stockQty : null,
              isOpen: sa.isOpen,
              distanceKm: sa.distanceKm,
              etaMinMins: sa.etaMinMins,
              etaMaxMins: sa.etaMaxMins,
              storeRating: sa.store.ratingAvg,
            });
          }
          offers.sort((a, b) => Number(b.inStock && b.isOpen) - Number(a.inStock && a.isOpen) || a.price - b.price || a.distanceKm - b.distanceKm);
          return {
            id: v.id,
            sku: v.sku,
            name: v.name,
            unitType: v.unitType,
            unitQuantity: Number(v.unitQuantity),
            unitsPerCase: v.unitsPerCase,
            isBulk: v.isBulk,
            mrp: v.mrp,
            bestOffer: offers[0] ?? null,
            offers,
          };
        })
        .filter((v) => v.bestOffer);
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        brand: p.brand ? { name: p.brand.name, slug: p.brand.slug } : null,
        category: p.category,
        vertical: p.vertical,
        description: p.description,
        imageUrl: p.imageUrl,
        localNames: p.localNames,
        isRegional: p.isRegional,
        isDemo: p.isDemo,
        taxRateBps: p.taxRateBps,
        requiresPrescription: p.requiresPrescription,
        schedule: p.schedule,
        genericName: p.genericName,
        strength: p.strength,
        dosageForm: p.dosageForm,
        manufacturer: p.manufacturer,
        variants,
      };
    })
    .filter((p) => p.variants.length > 0)
    .filter((p) => {
      const best = p.variants[0].bestOffer!;
      if (query.inStockOnly && !p.variants.some((v) => v.bestOffer!.inStock)) return false;
      if (query.minPrice != null && best.price < query.minPrice) return false;
      if (query.maxPrice != null && best.price > query.maxPrice) return false;
      if (query.maxEtaMins != null && best.etaMaxMins > query.maxEtaMins) return false;
      return true;
    });

  const bestPrice = (p: (typeof cards)[number]) => Math.min(...p.variants.map((v) => v.bestOffer!.price));
  const q = query.q?.toLowerCase();
  const score = (p: (typeof cards)[number]) => {
    if (!q) return 0;
    const n = p.name.toLowerCase();
    return (n.startsWith(q) ? 4 : n.includes(q) ? 2 : 0) + (p.localNames.includes(q) ? 3 : 0);
  };
  const inStockRank = (p: (typeof cards)[number]) => Number(p.variants.some((v) => v.bestOffer!.inStock));
  switch (query.sort) {
    case 'price_asc':
      cards.sort((a, b) => bestPrice(a) - bestPrice(b));
      break;
    case 'price_desc':
      cards.sort((a, b) => bestPrice(b) - bestPrice(a));
      break;
    case 'rating':
      cards.sort((a, b) => b.variants[0].bestOffer!.storeRating - a.variants[0].bestOffer!.storeRating);
      break;
    case 'eta':
      cards.sort((a, b) => a.variants[0].bestOffer!.etaMinMins - b.variants[0].bestOffer!.etaMinMins);
      break;
    default:
      cards.sort((a, b) => inStockRank(b) - inStockRank(a) || score(b) - score(a) || a.name.localeCompare(b.name));
  }

  const pageSize = Math.min(query.pageSize ?? 24, 100);
  const page = Math.max(query.page ?? 1, 1);
  return { items: cards.slice((page - 1) * pageSize, page * pageSize), total: cards.length, page, pageSize };
}

export type ProductCard = Awaited<ReturnType<typeof listProducts>>['items'][number];
