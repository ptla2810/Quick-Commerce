import type { DiscountType, FulfilmentType } from './enums';
import { splitInclusiveTax, exclusiveTax } from './money';

export interface PricedLineInput {
  key: string;
  unitPrice: number; // paise
  quantity: number;
  taxRateBps: number;
  taxInclusive: boolean;
  mrp?: number | null; // paise per unit, GST-inclusive
}

export interface CouponInput {
  code: string;
  discountType: DiscountType;
  value: number; // percent (whole number) for PERCENT, paise for FLAT
  maxDiscount?: number | null;
}

export interface DeliveryFeeRule {
  baseFee: number;
  freeAbove: number; // 0 disables free delivery
  perKmFee: number;
  freeKm: number;
  distanceKm: number;
}

export interface PricedLine {
  key: string;
  quantity: number;
  unitPrice: number;
  lineAmount: number; // GST-inclusive amount before discount
  discount: number;
  netAmount: number; // after discount
  taxableValue: number;
  tax: number;
  taxRateBps: number;
  mrpAmount: number;
}

export interface OrderTotals {
  lines: PricedLine[];
  itemsSubtotal: number;
  mrpTotal: number;
  discount: number;
  deliveryFee: number;
  taxableValue: number;
  taxTotal: number;
  grandTotal: number;
  couponApplied: string | null;
}

export function couponDiscount(itemsSubtotal: number, coupon: CouponInput | null | undefined): number {
  if (!coupon) return 0;
  if (coupon.discountType === 'PERCENT') {
    const raw = Math.round((itemsSubtotal * coupon.value) / 100);
    return Math.min(raw, coupon.maxDiscount ?? raw, itemsSubtotal);
  }
  if (coupon.discountType === 'FLAT') return Math.min(coupon.value, itemsSubtotal);
  return 0;
}

export function deliveryFeeFor(rule: DeliveryFeeRule, payableItems: number, fulfilment: FulfilmentType): number {
  if (fulfilment === 'PICKUP') return 0;
  if (rule.freeAbove > 0 && payableItems >= rule.freeAbove) return 0;
  const extraKm = Math.max(0, Math.ceil(rule.distanceKm - rule.freeKm));
  return rule.baseFee + extraKm * rule.perKmFee;
}

/**
 * Server-authoritative order maths. Every line is first converted to a GST-inclusive amount;
 * the coupon discount is then allocated across lines in proportion to value, and tax is
 * recomputed on each discounted line so the invoice taxable value reflects the discount.
 */
export function computeOrderTotals(
  inputs: PricedLineInput[],
  opts: { coupon?: CouponInput | null; delivery: DeliveryFeeRule; fulfilment: FulfilmentType },
): OrderTotals {
  const prelim = inputs.map((l) => {
    const base = l.unitPrice * l.quantity;
    const lineAmount = l.taxInclusive ? base : base + exclusiveTax(base, l.taxRateBps);
    return { l, lineAmount };
  });
  const itemsSubtotal = prelim.reduce((s, p) => s + p.lineAmount, 0);
  const discount = couponDiscount(itemsSubtotal, opts.coupon);

  let allocated = 0;
  const lines: PricedLine[] = prelim.map((p, i) => {
    const isLast = i === prelim.length - 1;
    const share = itemsSubtotal === 0 ? 0 : isLast ? discount - allocated : Math.floor((discount * p.lineAmount) / itemsSubtotal);
    allocated += share;
    const netAmount = p.lineAmount - share;
    const { taxable, tax } = splitInclusiveTax(netAmount, p.l.taxRateBps);
    const mrpUnit = p.l.mrp ?? null;
    return {
      key: p.l.key,
      quantity: p.l.quantity,
      unitPrice: p.l.unitPrice,
      lineAmount: p.lineAmount,
      discount: share,
      netAmount,
      taxableValue: taxable,
      tax,
      taxRateBps: p.l.taxRateBps,
      mrpAmount: mrpUnit && mrpUnit * p.l.quantity > p.lineAmount ? mrpUnit * p.l.quantity : p.lineAmount,
    };
  });

  const payableItems = itemsSubtotal - discount;
  const deliveryFee = opts.coupon?.discountType === 'FREE_DELIVERY' ? 0 : deliveryFeeFor(opts.delivery, payableItems, opts.fulfilment);

  return {
    lines,
    itemsSubtotal,
    mrpTotal: lines.reduce((s, l) => s + l.mrpAmount, 0),
    discount,
    deliveryFee,
    taxableValue: lines.reduce((s, l) => s + l.taxableValue, 0),
    taxTotal: lines.reduce((s, l) => s + l.tax, 0),
    grandTotal: payableItems + deliveryFee,
    couponApplied: opts.coupon?.code ?? null,
  };
}

export interface PriceTier {
  minQty: number;
  unitPrice: number;
}

/** Pick the best volume tier for a quantity; falls back to the base price. */
export function tieredUnitPrice(basePrice: number, tiers: PriceTier[], quantity: number): number {
  let price = basePrice;
  for (const t of tiers) if (quantity >= t.minQty && t.unitPrice < price) price = t.unitPrice;
  return price;
}

/** Commission in paise for a given value and rate in basis points. */
export function commissionFor(amount: number, rateBps: number): number {
  return Math.round((amount * rateBps) / 10000);
}
