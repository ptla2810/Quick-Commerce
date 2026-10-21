'use client';

import { use } from 'react';
import { Printer } from 'lucide-react';
import { RequireAuth } from '@/components/shells';
import { useApi } from '@/lib/api';
import { money } from '@/components/commerce';
import { Button, ErrorState, Spinner } from '@/components/ui';
import { BRAND } from '@/lib/brand';

interface Invoice {
  documentType: 'TAX_INVOICE' | 'ORDER_SUMMARY';
  invoiceNumber: string | null;
  orderNumber: string;
  date: string;
  isDemo: boolean;
  supplier: { name: string; legalName: string; gstin: string | null; address: string; stateCode: string };
  buyer: { name: string | null; gstin: string | null; address: string };
  placeOfSupply: string;
  intraState: boolean;
  lines: { description: string; hsn: string | null; quantity: number; unitPrice: number; discount: number; taxableValue: number; gstRateBps: number; cgst: number; sgst: number; igst: number; total: number }[];
  totals: { taxableValue: number; cgst: number; sgst: number; igst: number; itemsTotal: number; deliveryFee: number; grandTotal: number };
  paymentMethod: string;
  paymentStatus: string;
}

export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, loading } = useApi<{ invoice: Invoice }>(`/orders/${id}/invoice`);
  return (
    <main className="mx-auto max-w-4xl bg-white p-6 text-sm text-black">
      <RequireAuth>
        {loading && <Spinner />}
        {error && <ErrorState error={error} />}
        {data && <InvoiceDoc inv={data.invoice} />}
      </RequireAuth>
    </main>
  );
}

function InvoiceDoc({ inv }: { inv: Invoice }) {
  return (
    <article>
      {inv.isDemo && <p className="mb-3 rounded border border-orange-400 bg-orange-50 p-2 text-center font-semibold">DEMO DOCUMENT — fictional seller and GSTIN. Not valid for tax purposes.</p>}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">{inv.documentType === 'TAX_INVOICE' ? 'Tax Invoice' : 'Order Summary (not a tax invoice)'}</h1>
          {inv.invoiceNumber && <p>Invoice no: {inv.invoiceNumber}</p>}
          <p>Order no: {inv.orderNumber}</p>
          <p>Date: {new Date(inv.date).toLocaleDateString('en-IN')}</p>
        </div>
        <Button className="no-print" variant="secondary" onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden /> Print / Save PDF
        </Button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <p className="font-semibold">Sold by</p>
          <p>{inv.supplier.legalName}</p>
          <p>{inv.supplier.address}</p>
          <p>GSTIN: {inv.supplier.gstin ?? 'Not registered'}</p>
        </div>
        <div>
          <p className="font-semibold">Billed to</p>
          <p>{inv.buyer.name}</p>
          <p>{inv.buyer.address}</p>
          {inv.buyer.gstin && <p>GSTIN: {inv.buyer.gstin}</p>}
          <p>Place of supply: {inv.placeOfSupply}</p>
        </div>
      </div>
      <table className="mt-4 w-full border-collapse text-xs">
        <thead>
          <tr className="border-y border-black text-left">
            <th className="py-1">Item</th>
            <th>HSN</th>
            <th className="text-right">Qty</th>
            <th className="text-right">Rate</th>
            <th className="text-right">Disc.</th>
            <th className="text-right">Taxable</th>
            <th className="text-right">GST %</th>
            {inv.intraState ? (
              <>
                <th className="text-right">CGST</th>
                <th className="text-right">SGST</th>
              </>
            ) : (
              <th className="text-right">IGST</th>
            )}
            <th className="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {inv.lines.map((l, i) => (
            <tr key={i} className="border-b border-gray-300">
              <td className="py-1">{l.description}</td>
              <td>{l.hsn}</td>
              <td className="text-right">{l.quantity}</td>
              <td className="text-right">{money(l.unitPrice)}</td>
              <td className="text-right">{money(l.discount)}</td>
              <td className="text-right">{money(l.taxableValue)}</td>
              <td className="text-right">{l.gstRateBps / 100}</td>
              {inv.intraState ? (
                <>
                  <td className="text-right">{money(l.cgst)}</td>
                  <td className="text-right">{money(l.sgst)}</td>
                </>
              ) : (
                <td className="text-right">{money(l.igst)}</td>
              )}
              <td className="text-right">{money(l.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto mt-4 w-72 space-y-1">
        <Row k="Taxable value" v={money(inv.totals.taxableValue)} />
        {inv.intraState ? (
          <>
            <Row k="CGST" v={money(inv.totals.cgst)} />
            <Row k="SGST" v={money(inv.totals.sgst)} />
          </>
        ) : (
          <Row k="IGST" v={money(inv.totals.igst)} />
        )}
        <Row k="Items total" v={money(inv.totals.itemsTotal)} />
        <Row k="Delivery fee (platform)" v={money(inv.totals.deliveryFee)} />
        <Row k="Grand total" v={money(inv.totals.grandTotal)} bold />
        <p className="pt-2 text-xs">Payment: {inv.paymentMethod} ({inv.paymentStatus.replace('_', ' ').toLowerCase()})</p>
      </div>
      <p className="mt-6 text-xs text-gray-600">Generated by {BRAND.name}, a marketplace. Goods are supplied by the seller named above.</p>
    </article>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'border-t border-black pt-1 font-bold' : ''}`}>
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}
