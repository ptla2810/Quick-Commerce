import { tieredUnitPrice } from '@padosi/shared';
import type { PriceListType } from '@prisma/client';
import { prisma, type Tx } from '../lib/prisma';

export interface ResolvedPrice {
  basePrice: number;
  taxInclusive: boolean;
  minOrderQty: number;
  tiers: { minQty: number; unitPrice: number }[];
  source: PriceListType;
}

export interface Buyer {
  channel: 'RETAIL' | 'BUSINESS';
  /** Set only for an APPROVED business profile. */
  businessProfileId?: string | null;
}

const PRIORITY: Record<PriceListType, number> = { NEGOTIATED: 3, WHOLESALE: 2, RETAIL: 1 };

/**
 * Price resolution per store: a buyer's negotiated list beats the wholesale list, which beats retail.
 * Retail customers only ever see the retail list; wholesale and negotiated lists need an approved business.
 */
export async function resolvePrices(storeIds: string[], variantIds: string[], buyer: Buyer, tx: Tx = prisma) {
  const now = new Date();
  const business = buyer.channel === 'BUSINESS' && buyer.businessProfileId;
  const lists = await tx.priceList.findMany({
    where: {
      storeId: { in: storeIds },
      isActive: true,
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
      AND: [
        {
          OR: [
            { type: 'RETAIL' },
            ...(business ? [{ type: 'WHOLESALE' as const }, { type: 'NEGOTIATED' as const, businessProfileId: buyer.businessProfileId! }] : []),
          ],
        },
      ],
    },
    include: { items: { where: { variantId: { in: variantIds } }, include: { tiers: true } } },
  });

  const out = new Map<string, ResolvedPrice>(); // key: storeId:variantId
  for (const list of lists) {
    for (const item of list.items) {
      const key = `${list.storeId}:${item.variantId}`;
      const existing = out.get(key);
      if (existing && PRIORITY[existing.source] >= PRIORITY[list.type]) continue;
      out.set(key, {
        basePrice: item.unitPrice,
        taxInclusive: list.taxInclusive,
        minOrderQty: item.minOrderQty,
        tiers: item.tiers.map((t) => ({ minQty: t.minQty, unitPrice: t.unitPrice })).sort((a, b) => a.minQty - b.minQty),
        source: list.type,
      });
    }
  }
  return out;
}

export const unitPriceFor = (p: ResolvedPrice, qty: number) => tieredUnitPrice(p.basePrice, p.tiers, qty);

export async function approvedBusinessProfileId(userId: string): Promise<string | null> {
  const bp = await prisma.businessProfile.findUnique({ where: { userId }, select: { id: true, verificationStatus: true } });
  return bp?.verificationStatus === 'APPROVED' ? bp.id : null;
}
