import { describe, expect, it } from 'vitest';
import {
  canTransition,
  computeOrderTotals,
  estimateDeliveryWindow,
  formatINR,
  haversineKm,
  isWithinHours,
  nextStatusesFor,
  splitGst,
  splitInclusiveTax,
  tieredUnitPrice,
  normalizePhone,
  registerSchema,
  permissionsFor,
} from '../src';

const noDelivery = { baseFee: 0, freeAbove: 0, perKmFee: 0, freeKm: 0, distanceKm: 0 };

describe('money', () => {
  it('formats INR with Indian grouping', () => {
    expect(formatINR(12345650)).toBe('₹1,23,456.50');
    expect(formatINR(19900)).toBe('₹199');
  });
  it('splits GST-inclusive amounts', () => {
    expect(splitInclusiveTax(10500, 500)).toEqual({ taxable: 10000, tax: 500 });
    expect(splitInclusiveTax(10000, 0)).toEqual({ taxable: 10000, tax: 0 });
  });
  it('splits CGST/SGST for intra-state supplies', () => {
    expect(splitGst(501, true)).toEqual({ cgst: 250, sgst: 251, igst: 0 });
    expect(splitGst(501, false)).toEqual({ cgst: 0, sgst: 0, igst: 501 });
  });
});

describe('computeOrderTotals', () => {
  it('totals inclusive lines and adds delivery fee below the free threshold', () => {
    const t = computeOrderTotals(
      [
        { key: 'a', unitPrice: 5000, quantity: 2, taxRateBps: 500, taxInclusive: true, mrp: 5500 },
        { key: 'b', unitPrice: 3000, quantity: 1, taxRateBps: 0, taxInclusive: true },
      ],
      { delivery: { baseFee: 2000, freeAbove: 19900, perKmFee: 500, freeKm: 2, distanceKm: 3.2 }, fulfilment: 'DELIVERY' },
    );
    expect(t.itemsSubtotal).toBe(13000);
    expect(t.mrpTotal).toBe(14000);
    expect(t.deliveryFee).toBe(2000 + 2 * 500);
    expect(t.grandTotal).toBe(16000);
    expect(t.taxTotal).toBe(476);
  });

  it('allocates a coupon discount across lines and recomputes tax', () => {
    const t = computeOrderTotals(
      [
        { key: 'a', unitPrice: 10000, quantity: 1, taxRateBps: 500, taxInclusive: true },
        { key: 'b', unitPrice: 10000, quantity: 1, taxRateBps: 1800, taxInclusive: true },
      ],
      { coupon: { code: 'TEN', discountType: 'PERCENT', value: 10, maxDiscount: 5000 }, delivery: noDelivery, fulfilment: 'DELIVERY' },
    );
    expect(t.discount).toBe(2000);
    expect(t.lines.map((l) => l.discount)).toEqual([1000, 1000]);
    expect(t.lines.reduce((s, l) => s + l.netAmount, 0)).toBe(18000);
    expect(t.grandTotal).toBe(18000);
  });

  it('caps percentage discounts and adds tax on exclusive (wholesale) prices', () => {
    const t = computeOrderTotals([{ key: 'a', unitPrice: 100000, quantity: 1, taxRateBps: 1800, taxInclusive: false }], {
      coupon: { code: 'BIG', discountType: 'PERCENT', value: 50, maxDiscount: 10000 },
      delivery: noDelivery,
      fulfilment: 'DELIVERY',
    });
    expect(t.itemsSubtotal).toBe(118000);
    expect(t.discount).toBe(10000);
    expect(t.grandTotal).toBe(108000);
  });

  it('waives delivery for pickup and free-delivery coupons', () => {
    const rule = { baseFee: 2500, freeAbove: 0, perKmFee: 0, freeKm: 0, distanceKm: 1 };
    const line = [{ key: 'a', unitPrice: 1000, quantity: 1, taxRateBps: 0, taxInclusive: true }];
    expect(computeOrderTotals(line, { delivery: rule, fulfilment: 'PICKUP' }).deliveryFee).toBe(0);
    expect(
      computeOrderTotals(line, { delivery: rule, fulfilment: 'DELIVERY', coupon: { code: 'F', discountType: 'FREE_DELIVERY', value: 0 } }).deliveryFee,
    ).toBe(0);
  });

  it('applies the best volume tier', () => {
    expect(tieredUnitPrice(1000, [{ minQty: 10, unitPrice: 900 }, { minQty: 50, unitPrice: 850 }], 12)).toBe(900);
    expect(tieredUnitPrice(1000, [{ minQty: 10, unitPrice: 900 }, { minQty: 50, unitPrice: 850 }], 50)).toBe(850);
    expect(tieredUnitPrice(1000, [{ minQty: 10, unitPrice: 900 }], 2)).toBe(1000);
  });
});

describe('order state machine', () => {
  it('lets sellers accept placed orders but not customers', () => {
    expect(canTransition('PLACED', 'ACCEPTED', 'SELLER')).toBe(true);
    expect(canTransition('PLACED', 'ACCEPTED', 'CUSTOMER')).toBe(false);
  });
  it('blocks skipping steps and leaving terminal states', () => {
    expect(canTransition('PLACED', 'DELIVERED', 'ADMIN')).toBe(false);
    expect(canTransition('DELIVERED', 'CANCELLED', 'ADMIN')).toBe(false);
  });
  it('does not let a seller accept an order awaiting prescription review', () => {
    expect(canTransition('AWAITING_RX_REVIEW', 'ACCEPTED', 'SELLER')).toBe(false);
  });
  it('only completes READY_FOR_PICKUP -> DELIVERED for pickup orders', () => {
    expect(canTransition('READY_FOR_PICKUP', 'DELIVERED', 'SELLER', { fulfilmentType: 'DELIVERY' })).toBe(false);
    expect(canTransition('READY_FOR_PICKUP', 'DELIVERED', 'SELLER', { fulfilmentType: 'PICKUP' })).toBe(true);
    expect(nextStatusesFor('READY_FOR_PICKUP', 'ADMIN', { fulfilmentType: 'DELIVERY' })).toEqual(['OUT_FOR_DELIVERY', 'CANCELLED']);
  });
});

describe('geo', () => {
  it('computes distance between two Jhansi points', () => {
    const d = haversineKm({ lat: 25.4484, lng: 78.5685 }, { lat: 25.4609, lng: 78.5793 });
    expect(d).toBeGreaterThan(1.5);
    expect(d).toBeLessThan(1.9);
  });
  it('produces a rounded estimate window', () => {
    expect(estimateDeliveryWindow(3, { prepTimeMins: 10, avgSpeedKmph: 18, bufferMins: 10, roadFactor: 1.3 })).toEqual({ minMins: 25, maxMins: 35 });
  });
  it('handles store hours across midnight', () => {
    expect(isWithinHours(480, 1320, 600)).toBe(true);
    expect(isWithinHours(480, 1320, 1330)).toBe(false);
    expect(isWithinHours(1200, 120, 60)).toBe(true);
  });
});

describe('validation', () => {
  it('normalises Indian phone numbers', () => {
    expect(normalizePhone('+91 98765 43210')).toBe('9876543210');
    expect(normalizePhone('09876543210')).toBe('9876543210');
  });
  it('requires a phone or email when registering', () => {
    expect(registerSchema.safeParse({ name: 'A', password: 'abcd1234' }).success).toBe(false);
    expect(registerSchema.safeParse({ name: 'A', phone: '9876543210', password: 'abcd1234' }).success).toBe(true);
  });
  it('keeps settings permission for super admins only', () => {
    expect(permissionsFor(['ADMIN'])).not.toContain('admin:settings');
    expect(permissionsFor(['SUPER_ADMIN'])).toContain('admin:settings');
  });
});
