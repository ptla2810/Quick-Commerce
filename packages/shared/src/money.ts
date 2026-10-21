// All money is handled as integer paise (1 rupee = 100 paise) to avoid floating-point errors.
// GST rates are expressed in basis points (500 = 5%).

export const rupees = (r: number): number => Math.round(r * 100);

const wholeRupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const withPaise = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹1,234 for whole rupees, ₹1,234.50 when there are paise. */
export function formatINR(paise: number): string {
  return (paise % 100 === 0 ? wholeRupees : withPaise).format(paise / 100);
}

/** Split a GST-inclusive amount into taxable value and tax. */
export function splitInclusiveTax(grossPaise: number, rateBps: number): { taxable: number; tax: number } {
  if (rateBps <= 0) return { taxable: grossPaise, tax: 0 };
  const taxable = Math.round((grossPaise * 10000) / (10000 + rateBps));
  return { taxable, tax: grossPaise - taxable };
}

/** Tax to add on top of a GST-exclusive amount. */
export function exclusiveTax(netPaise: number, rateBps: number): number {
  return Math.round((netPaise * rateBps) / 10000);
}

/**
 * Intra-state supplies attract CGST + SGST (half each); inter-state supplies attract IGST.
 */
export function splitGst(taxPaise: number, intraState: boolean): { cgst: number; sgst: number; igst: number } {
  if (!intraState) return { cgst: 0, sgst: 0, igst: taxPaise };
  const cgst = Math.floor(taxPaise / 2);
  return { cgst, sgst: taxPaise - cgst, igst: 0 };
}
