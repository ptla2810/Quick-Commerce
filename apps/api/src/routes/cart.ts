import { Router } from 'express';
import { z } from 'zod';
import { cartItemSchema, checkoutSchema } from '@padosi/shared';
import { prisma } from '../lib/prisma';
import { AppError, conflict, notFound, parse } from '../lib/errors';
import { authOf, requireAuth } from '../middleware/auth';
import { approvedBusinessProfileId, resolvePrices, unitPriceFor } from '../services/pricing';
import { buildQuote, loadCart, type Quote } from '../services/quote';
import { publicStore, storeIsOpen } from '../services/serviceability';

export const cartRouter = Router();
cartRouter.use(requireAuth);

const modeQuery = z.object({ mode: z.enum(['RETAIL', 'BUSINESS']).default('RETAIL') });

async function cartView(userId: string, mode: 'RETAIL' | 'BUSINESS') {
  const cart = await loadCart(userId, mode);
  if (!cart) return { cart: null };
  const store = await prisma.store.findUniqueOrThrow({ where: { id: cart.storeId } });
  const variantIds = cart.items.map((i) => i.variantId);
  const businessProfileId = mode === 'BUSINESS' ? await approvedBusinessProfileId(userId) : null;
  const [inv, prices] = await Promise.all([
    prisma.storeInventory.findMany({ where: { storeId: store.id, variantId: { in: variantIds } } }),
    resolvePrices([store.id], variantIds, { channel: mode, businessProfileId }),
  ]);
  const invBy = new Map(inv.map((i) => [i.variantId, i]));
  const items = cart.items.map((i) => {
    const price = prices.get(`${store.id}:${i.variantId}`);
    const stock = invBy.get(i.variantId);
    const unitPrice = price ? unitPriceFor(price, i.quantity) : null;
    const purchasable = !!price && !!stock?.isAvailable && i.variant.isActive && i.variant.product.isActive && !i.variant.product.isRestricted;
    return {
      id: i.id,
      variantId: i.variantId,
      quantity: i.quantity,
      substitutionPref: i.substitutionPref,
      productName: i.variant.product.name,
      productSlug: i.variant.product.slug,
      variantName: i.variant.name,
      sku: i.variant.sku,
      vertical: i.variant.product.vertical,
      requiresPrescription: i.variant.product.requiresPrescription,
      mrp: i.variant.mrp,
      unitPrice,
      taxInclusive: price?.taxInclusive ?? true,
      minOrderQty: price?.minOrderQty ?? 1,
      tiers: price?.tiers ?? [],
      lineTotal: unitPrice != null ? unitPrice * i.quantity : null,
      available: purchasable,
      stockStatus: !purchasable ? 'UNAVAILABLE' : stock!.stockQty <= 0 ? 'OUT_OF_STOCK' : stock!.stockQty < i.quantity ? 'INSUFFICIENT' : 'OK',
      maxQuantity: stock?.stockQty ?? 0,
    };
  });
  return {
    cart: {
      id: cart.id,
      mode,
      store: publicStore({ store, isOpen: storeIsOpen(store) }),
      items,
      itemCount: items.reduce((s, i) => s + i.quantity, 0),
      estimatedSubtotal: items.reduce((s, i) => s + (i.lineTotal ?? 0), 0),
      requiresPrescription: items.some((i) => i.requiresPrescription),
    },
  };
}

cartRouter.get('/', async (req, res) => {
  const { mode } = parse(modeQuery, req.query);
  res.json(await cartView(authOf(req).user.id, mode));
});

async function assertPurchasable(storeId: string, variantId: string, mode: 'RETAIL' | 'BUSINESS', businessProfileId: string | null) {
  const store = await prisma.store.findFirst({ where: { id: storeId, isActive: true, sellerOrg: { verificationStatus: 'APPROVED' } } });
  if (!store) throw notFound('Store');
  const inv = await prisma.storeInventory.findUnique({
    where: { storeId_variantId: { storeId, variantId } },
    include: { variant: { include: { product: true } } },
  });
  if (!inv || !inv.isAvailable || !inv.variant.isActive || !inv.variant.product.isActive) throw new AppError(400, 'PRODUCT_UNAVAILABLE', 'This product is not available at this store');
  if (inv.variant.product.isRestricted) throw new AppError(400, 'RESTRICTED_PRODUCT', 'This product cannot be sold on this platform');
  const price = (await resolvePrices([storeId], [variantId], { channel: mode, businessProfileId })).get(`${storeId}:${variantId}`);
  if (!price) throw new AppError(400, 'PRICE_UNAVAILABLE', 'This product has no price at this store');
  return { inv, price };
}

cartRouter.post('/items', async (req, res) => {
  const input = parse(cartItemSchema, req.body);
  const userId = authOf(req).user.id;
  const businessProfileId = input.mode === 'BUSINESS' ? await approvedBusinessProfileId(userId) : null;
  if (input.mode === 'BUSINESS' && !businessProfileId) throw new AppError(403, 'BUSINESS_NOT_VERIFIED', 'Business ordering needs a verified business account');

  const existing = await prisma.cart.findUnique({ where: { userId_channel: { userId, channel: input.mode } } });
  if (existing && existing.storeId !== input.storeId) {
    if (!input.replaceCart) {
      const store = await prisma.store.findUnique({ where: { id: existing.storeId }, select: { name: true } });
      throw conflict('CART_STORE_CONFLICT', `Your cart has items from ${store?.name ?? 'another store'}. Each order is delivered by one store.`, { currentStoreName: store?.name });
    }
    await prisma.cart.delete({ where: { id: existing.id } });
  }

  if (input.quantity === 0) {
    if (existing && existing.storeId === input.storeId) await prisma.cartItem.deleteMany({ where: { cartId: existing.id, variantId: input.variantId } });
    const remaining = existing ? await prisma.cartItem.count({ where: { cartId: existing.id } }) : 0;
    if (existing && remaining === 0) await prisma.cart.delete({ where: { id: existing.id } }).catch(() => {});
    return res.json(await cartView(userId, input.mode));
  }

  const { inv, price } = await assertPurchasable(input.storeId, input.variantId, input.mode, businessProfileId);
  if (inv.stockQty < input.quantity) throw new AppError(400, 'INSUFFICIENT_STOCK', inv.stockQty > 0 ? `Only ${inv.stockQty} left in stock` : 'Out of stock', { maxQuantity: inv.stockQty });
  if (input.quantity < price.minOrderQty) throw new AppError(400, 'BELOW_MOQ', `Minimum order quantity is ${price.minOrderQty}`, { minOrderQty: price.minOrderQty });

  const cart = await prisma.cart.upsert({
    where: { userId_channel: { userId, channel: input.mode } },
    create: { userId, storeId: input.storeId, channel: input.mode },
    update: {},
  });
  await prisma.cartItem.upsert({
    where: { cartId_variantId: { cartId: cart.id, variantId: input.variantId } },
    create: { cartId: cart.id, variantId: input.variantId, quantity: input.quantity, substitutionPref: input.substitutionPref ?? 'SIMILAR_ITEM' },
    update: { quantity: input.quantity, ...(input.substitutionPref ? { substitutionPref: input.substitutionPref } : {}) },
  });
  res.json(await cartView(userId, input.mode));
});

const bulkSchema = z.object({
  storeId: z.string(),
  mode: z.enum(['RETAIL', 'BUSINESS']).default('BUSINESS'),
  replaceCart: z.boolean().default(false),
  items: z.array(z.object({ sku: z.string().trim().optional(), variantId: z.string().optional(), quantity: z.number().int().min(1).max(10000) })).min(1).max(200),
});

/** Quick order entry for business buyers: add many SKUs at once, reporting per-line problems. */
cartRouter.post('/bulk', async (req, res) => {
  const input = parse(bulkSchema, req.body);
  const userId = authOf(req).user.id;
  const businessProfileId = input.mode === 'BUSINESS' ? await approvedBusinessProfileId(userId) : null;
  if (input.mode === 'BUSINESS' && !businessProfileId) throw new AppError(403, 'BUSINESS_NOT_VERIFIED', 'Business ordering needs a verified business account');
  const existing = await prisma.cart.findUnique({ where: { userId_channel: { userId, channel: input.mode } } });
  if (existing && existing.storeId !== input.storeId) {
    if (!input.replaceCart) throw conflict('CART_STORE_CONFLICT', 'Your cart has items from another store. Each order is delivered by one store.');
    await prisma.cart.delete({ where: { id: existing.id } });
  }
  const results: { line: number; sku?: string; ok: boolean; message?: string }[] = [];
  const cart = await prisma.cart.upsert({ where: { userId_channel: { userId, channel: input.mode } }, create: { userId, storeId: input.storeId, channel: input.mode }, update: {} });
  for (const [idx, line] of input.items.entries()) {
    try {
      const variant = line.variantId
        ? await prisma.productVariant.findUnique({ where: { id: line.variantId } })
        : await prisma.productVariant.findUnique({ where: { sku: line.sku ?? '' } });
      if (!variant) throw new AppError(404, 'NOT_FOUND', 'SKU not found');
      const { inv, price } = await assertPurchasable(input.storeId, variant.id, input.mode, businessProfileId);
      const qty = Math.max(line.quantity, price.minOrderQty);
      if (inv.stockQty < qty) throw new AppError(400, 'INSUFFICIENT_STOCK', `Only ${inv.stockQty} in stock`);
      await prisma.cartItem.upsert({
        where: { cartId_variantId: { cartId: cart.id, variantId: variant.id } },
        create: { cartId: cart.id, variantId: variant.id, quantity: qty },
        update: { quantity: qty },
      });
      results.push({ line: idx + 1, sku: variant.sku, ok: true, message: qty !== line.quantity ? `Raised to minimum order quantity ${qty}` : undefined });
    } catch (e) {
      results.push({ line: idx + 1, sku: line.sku, ok: false, message: e instanceof AppError ? e.message : 'Could not add' });
    }
  }
  if ((await prisma.cartItem.count({ where: { cartId: cart.id } })) === 0) await prisma.cart.delete({ where: { id: cart.id } });
  res.json({ results, ...(await cartView(userId, input.mode)) });
});

cartRouter.delete('/', async (req, res) => {
  const { mode } = parse(modeQuery, req.query);
  await prisma.cart.deleteMany({ where: { userId: authOf(req).user.id, channel: mode } });
  res.json({ cart: null });
});

export function quoteView(q: Quote) {
  return {
    storeId: q.storeId,
    vertical: q.vertical,
    requiresPrescription: q.requiresPrescription,
    issues: q.issues,
    canPlaceOrder: q.issues.length === 0,
    paymentMethods: q.paymentMethods,
    delivery: q.storeAvailability ? { distanceKm: q.storeAvailability.distanceKm, etaMinMins: q.storeAvailability.etaMinMins, etaMaxMins: q.storeAvailability.etaMaxMins } : null,
    coupon: q.coupon ? { code: q.coupon.code, description: q.coupon.description } : null,
    lines: q.lines.map((l) => {
      const t = q.totals?.lines.find((x) => x.key === l.variantId);
      return {
        variantId: l.variantId,
        productName: l.product.name,
        variantName: l.variant.name,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxRateBps: l.product.taxRateBps,
        taxInclusive: l.price?.taxInclusive ?? true,
        lineAmount: t?.lineAmount ?? 0,
        discount: t?.discount ?? 0,
        tax: t?.tax ?? 0,
        requiresPrescription: l.product.requiresPrescription,
      };
    }),
    totals: q.totals
      ? {
          itemsSubtotal: q.totals.itemsSubtotal,
          mrpTotal: q.totals.mrpTotal,
          savings: q.totals.mrpTotal - q.totals.itemsSubtotal + q.totals.discount,
          discount: q.totals.discount,
          deliveryFee: q.totals.deliveryFee,
          taxableValue: q.totals.taxableValue,
          taxTotal: q.totals.taxTotal,
          grandTotal: q.totals.grandTotal,
        }
      : null,
  };
}

export const checkoutRouter = Router();
checkoutRouter.use(requireAuth);
checkoutRouter.post('/quote', async (req, res) => {
  const input = parse(checkoutSchema, req.body);
  res.json(quoteView(await buildQuote(authOf(req).user.id, input)));
});
