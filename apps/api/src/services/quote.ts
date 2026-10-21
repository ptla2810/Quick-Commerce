import {
  computeOrderTotals,
  ONLINE_PAYMENT_METHODS,
  type CheckoutInput,
  type CouponInput,
  type OrderTotals,
  type Vertical,
} from '@padosi/shared';
import type { Address, Cart, CartItem, Coupon, Locality, Product, ProductVariant, StoreInventory, City } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getSettings } from '../lib/settings';
import { serviceableStores, storeIsOpen, type StoreAvailability } from './serviceability';
import { approvedBusinessProfileId, resolvePrices, unitPriceFor, type ResolvedPrice } from './pricing';

export interface QuoteIssue {
  code: string;
  message: string;
  variantId?: string;
}

type CartWithItems = Cart & {
  items: (CartItem & { variant: ProductVariant & { product: Product } })[];
};

export interface QuoteLine {
  variantId: string;
  product: Product;
  variant: ProductVariant;
  quantity: number;
  substitutionPref: CartItem['substitutionPref'];
  price: ResolvedPrice | null;
  unitPrice: number;
  inventory: StoreInventory | null;
}

export interface Quote {
  cart: CartWithItems | null;
  storeId: string | null;
  storeAvailability: StoreAvailability | null;
  address: (Address & { locality: Locality & { city: City } }) | null;
  lines: QuoteLine[];
  totals: OrderTotals | null;
  coupon: Coupon | null;
  vertical: Vertical;
  requiresPrescription: boolean;
  businessProfileId: string | null;
  commissionRateBps: number;
  sellerFundedDiscount: number;
  intraState: boolean;
  issues: QuoteIssue[];
  paymentMethods: { method: string; available: boolean; reason?: string }[];
}

export async function loadCart(userId: string, channel: 'RETAIL' | 'BUSINESS') {
  return prisma.cart.findUnique({
    where: { userId_channel: { userId, channel } },
    include: { items: { include: { variant: { include: { product: true } } }, orderBy: { id: 'asc' } } },
  });
}

/**
 * Builds a server-authoritative quote for the user's cart. Problems are collected as issues so the
 * checkout screen can show all of them at once; order placement refuses any quote that has issues.
 */
export async function buildQuote(userId: string, input: CheckoutInput): Promise<Quote> {
  const issues: QuoteIssue[] = [];
  const settings = await getSettings();
  const cart = await loadCart(userId, input.mode);
  const empty: Quote = {
    cart,
    storeId: null,
    storeAvailability: null,
    address: null,
    lines: [],
    totals: null,
    coupon: null,
    vertical: 'GROCERY',
    requiresPrescription: false,
    businessProfileId: null,
    commissionRateBps: 0,
    sellerFundedDiscount: 0,
    intraState: true,
    issues,
    paymentMethods: [],
  };
  if (!cart || cart.items.length === 0) {
    issues.push({ code: 'EMPTY_CART', message: 'Your cart is empty' });
    return empty;
  }

  const store = await prisma.store.findUnique({
    where: { id: cart.storeId },
    include: { sellerOrg: { include: { licences: true } }, locality: { include: { city: true } } },
  });
  if (!store || !store.isActive || store.sellerOrg.verificationStatus !== 'APPROVED') {
    issues.push({ code: 'STORE_UNAVAILABLE', message: 'This store is not taking orders right now' });
    return { ...empty, storeId: cart.storeId };
  }

  // Business buyers must be verified before wholesale prices or business ordering apply.
  let businessProfileId: string | null = null;
  if (input.mode === 'BUSINESS') {
    businessProfileId = await approvedBusinessProfileId(userId);
    if (!businessProfileId) issues.push({ code: 'BUSINESS_NOT_VERIFIED', message: 'Your business account must be verified before placing business orders' });
  }

  // Address & serviceability
  let address: Quote['address'] = null;
  let availability: StoreAvailability | null = null;
  if (input.fulfilmentType === 'DELIVERY') {
    if (!input.addressId) issues.push({ code: 'ADDRESS_REQUIRED', message: 'Choose a delivery address' });
    else {
      address = await prisma.address.findFirst({
        where: { id: input.addressId, userId, isDeleted: false },
        include: { locality: { include: { city: true } } },
      });
      if (!address) issues.push({ code: 'ADDRESS_REQUIRED', message: 'Choose a delivery address' });
      else {
        const list = await serviceableStores({ localityId: address.localityId, lat: address.lat, lng: address.lng });
        availability = list.find((s) => s.store.id === store.id) ?? null;
        if (!availability) issues.push({ code: 'UNSERVICEABLE', message: `${store.name} does not deliver to this address` });
      }
    }
  } else if (!store.pickupEnabled) {
    issues.push({ code: 'PICKUP_UNAVAILABLE', message: 'This store does not offer pickup' });
  }

  if (input.scheduledFor) {
    if (!store.scheduledDeliveryEnabled) issues.push({ code: 'SCHEDULE_NOT_SUPPORTED', message: 'This store does not offer scheduled delivery' });
    else if (new Date(input.scheduledFor).getTime() < Date.now() + 30 * 60_000)
      issues.push({ code: 'SCHEDULE_INVALID', message: 'Scheduled time must be at least 30 minutes from now' });
  } else if (!storeIsOpen(store)) {
    issues.push({ code: 'STORE_CLOSED', message: `${store.name} is closed right now` });
  }

  // Lines: product status, stock, price, MOQ
  const variantIds = cart.items.map((i) => i.variantId);
  const [inventory, prices] = await Promise.all([
    prisma.storeInventory.findMany({ where: { storeId: store.id, variantId: { in: variantIds } } }),
    resolvePrices([store.id], variantIds, { channel: input.mode, businessProfileId }),
  ]);
  const invBy = new Map(inventory.map((i) => [i.variantId, i]));

  const lines: QuoteLine[] = cart.items.map((item) => {
    const inv = invBy.get(item.variantId) ?? null;
    const price = prices.get(`${store.id}:${item.variantId}`) ?? null;
    const { product, ...variant } = item.variant;
    const name = `${product.name} (${variant.name})`;
    if (product.isRestricted) issues.push({ code: 'RESTRICTED_PRODUCT', message: `${name} cannot be sold on this platform`, variantId: item.variantId });
    else if (!product.isActive || !variant.isActive || !inv || !inv.isAvailable)
      issues.push({ code: 'PRODUCT_UNAVAILABLE', message: `${name} is no longer available`, variantId: item.variantId });
    else if (inv.stockQty <= 0) issues.push({ code: 'OUT_OF_STOCK', message: `${name} is out of stock`, variantId: item.variantId });
    else if (inv.stockQty < item.quantity)
      issues.push({ code: 'INSUFFICIENT_STOCK', message: `Only ${inv.stockQty} of ${name} left`, variantId: item.variantId });
    if (!price) issues.push({ code: 'PRICE_UNAVAILABLE', message: `${name} has no price at this store`, variantId: item.variantId });
    else if (item.quantity < price.minOrderQty)
      issues.push({ code: 'BELOW_MOQ', message: `Minimum order for ${name} is ${price.minOrderQty}`, variantId: item.variantId });
    return {
      variantId: item.variantId,
      product,
      variant: variant as ProductVariant,
      quantity: item.quantity,
      substitutionPref: item.substitutionPref,
      price,
      unitPrice: price ? unitPriceFor(price, item.quantity) : 0,
      inventory: inv,
    };
  });

  // Pharmacy safeguards
  const hasChemist = lines.some((l) => l.product.vertical === 'CHEMIST');
  const requiresPrescription = lines.some((l) => l.product.requiresPrescription);
  if (hasChemist) {
    const licensed =
      store.sellerOrg.sellerType === 'PHARMACY' &&
      store.sellerOrg.licences.some((l) => l.type === 'DRUG_LICENCE' && l.status === 'APPROVED' && (!l.validUntil || l.validUntil > new Date()));
    if (!licensed) issues.push({ code: 'PHARMACY_NOT_VERIFIED', message: 'Medicines can only be ordered from a pharmacy with a verified drug licence' });
  }
  if (requiresPrescription) {
    if (!input.prescriptionId) issues.push({ code: 'PRESCRIPTION_REQUIRED', message: 'Upload or select a prescription for prescription medicines' });
    else {
      const rx = await prisma.prescription.findFirst({ where: { id: input.prescriptionId, userId } });
      const expired = rx?.validUntil && rx.validUntil < new Date();
      if (!rx || rx.status === 'REJECTED' || rx.status === 'EXPIRED' || expired)
        issues.push({ code: 'PRESCRIPTION_INVALID', message: 'The selected prescription cannot be used. Please upload a valid prescription.' });
    }
  }
  const vertical: Vertical = input.mode === 'BUSINESS' ? 'HORECA' : hasChemist ? 'CHEMIST' : 'GROCERY';

  // Coupon
  const priced = lines.filter((l) => l.price);
  const preliminary = computeOrderTotals(
    priced.map((l) => ({ key: l.variantId, unitPrice: l.unitPrice, quantity: l.quantity, taxRateBps: l.product.taxRateBps, taxInclusive: l.price!.taxInclusive, mrp: l.variant.mrp })),
    { delivery: { baseFee: 0, freeAbove: 0, perKmFee: 0, freeKm: 0, distanceKm: 0 }, fulfilment: input.fulfilmentType },
  );
  let coupon: Coupon | null = null;
  if (input.couponCode) {
    const res = await validateCoupon(input.couponCode, {
      userId,
      storeId: store.id,
      cityId: store.locality.cityId,
      vertical,
      itemsSubtotal: preliminary.itemsSubtotal,
    });
    if ('issue' in res) issues.push(res.issue);
    else coupon = res.coupon;
  }

  const distanceKm = availability?.distanceKm ?? 0;
  const totals = computeOrderTotals(
    priced.map((l) => ({ key: l.variantId, unitPrice: l.unitPrice, quantity: l.quantity, taxRateBps: l.product.taxRateBps, taxInclusive: l.price!.taxInclusive, mrp: l.variant.mrp })),
    {
      coupon: coupon ? ({ code: coupon.code, discountType: coupon.discountType, value: coupon.value, maxDiscount: coupon.maxDiscount } as CouponInput) : null,
      delivery: {
        baseFee: store.baseDeliveryFee,
        freeAbove: store.freeDeliveryAbove,
        perKmFee: settings.delivery.perKmFee,
        freeKm: settings.delivery.freeKm,
        distanceKm,
      },
      fulfilment: input.fulfilmentType,
    },
  );

  if (totals.itemsSubtotal < store.minOrderValue)
    issues.push({ code: 'BELOW_MIN_ORDER', message: `Minimum order at ${store.name} is ₹${(store.minOrderValue / 100).toFixed(0)}` });

  // Payment options
  const paymentMethods: Quote['paymentMethods'] = [];
  const codOk = totals.grandTotal <= settings.codMaxOrderValue;
  paymentMethods.push({ method: 'COD', available: codOk, reason: codOk ? undefined : 'Order value exceeds the cash-on-delivery limit' });
  for (const m of ONLINE_PAYMENT_METHODS) paymentMethods.push({ method: m, available: true });
  if (input.mode === 'BUSINESS') {
    const bp = businessProfileId ? await prisma.businessProfile.findUnique({ where: { id: businessProfileId } }) : null;
    const available = !!bp?.creditApproved && bp.creditUsed + totals.grandTotal <= bp.creditLimit;
    paymentMethods.push({
      method: 'BUSINESS_CREDIT',
      available,
      reason: !bp?.creditApproved ? 'Credit terms are not approved for this account' : available ? undefined : 'Credit limit exceeded',
    });
  }
  const chosen = paymentMethods.find((p) => p.method === input.paymentMethod);
  if (!chosen) issues.push({ code: 'PAYMENT_METHOD_INVALID', message: 'This payment method is not available' });
  else if (!chosen.available) issues.push({ code: 'PAYMENT_METHOD_UNAVAILABLE', message: chosen.reason ?? 'This payment method is not available' });

  const commissionRateBps = store.sellerOrg.commissionRateBps ?? settings.commissionBps[vertical];
  const intraState = !address || address.locality.city.stateCode === store.locality.city.stateCode;

  return {
    cart,
    storeId: store.id,
    storeAvailability: availability,
    address,
    lines,
    totals,
    coupon,
    vertical,
    requiresPrescription,
    businessProfileId,
    commissionRateBps,
    sellerFundedDiscount: coupon?.storeId ? totals.discount : 0,
    intraState,
    issues,
    paymentMethods,
  };
}

export async function validateCoupon(
  code: string,
  ctx: { userId: string; storeId: string; cityId: string; vertical: Vertical; itemsSubtotal: number },
): Promise<{ coupon: Coupon } | { issue: QuoteIssue }> {
  const bad = (message: string) => ({ issue: { code: 'COUPON_INVALID', message } });
  const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
  const now = new Date();
  if (!coupon || !coupon.isActive || coupon.validFrom > now || coupon.validTo < now) return bad('This coupon is not valid');
  if (coupon.vertical && coupon.vertical !== ctx.vertical) return bad(`This coupon applies only to ${coupon.vertical.toLowerCase()} orders`);
  if (coupon.cityId && coupon.cityId !== ctx.cityId) return bad('This coupon is not valid in your city');
  if (coupon.storeId && coupon.storeId !== ctx.storeId) return bad('This coupon is not valid at this store');
  if (ctx.itemsSubtotal < coupon.minOrderValue) return bad(`Add items worth ₹${((coupon.minOrderValue - ctx.itemsSubtotal) / 100).toFixed(0)} more to use this coupon`);
  if (coupon.usageLimit) {
    const used = await prisma.couponRedemption.count({ where: { couponId: coupon.id } });
    if (used >= coupon.usageLimit) return bad('This coupon has been fully redeemed');
  }
  const mine = await prisma.couponRedemption.count({ where: { couponId: coupon.id, userId: ctx.userId } });
  if (mine >= coupon.perUserLimit) return bad('You have already used this coupon');
  if (coupon.firstOrderOnly) {
    const prior = await prisma.order.count({ where: { userId: ctx.userId, status: { notIn: ['CANCELLED', 'REJECTED'] } } });
    if (prior > 0) return bad('This coupon is only for your first order');
  }
  return { coupon };
}
