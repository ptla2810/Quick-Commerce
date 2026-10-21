'use client';

import { useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { SellerShell, useSellerStore } from '@/components/seller';
import { useToast } from '@/components/providers/toast';
import { api, ApiError, useApi } from '@/lib/api';
import { money } from '@/components/commerce';
import { Badge, Button, Checkbox, EmptyState, ErrorState, Input, LinkButton, Modal, Notice, PageTitle, Spinner, Tabs, Textarea } from '@/components/ui';

interface Row {
  id: string;
  sku: string;
  productName: string;
  variantName: string;
  category: string;
  vertical: string;
  mrp: number;
  price: number | null;
  wholesalePrice: number | null;
  minOrderQty: number;
  stockQty: number;
  lowStockThreshold: number;
  isAvailable: boolean;
  batchNumber: string | null;
  expiryDate: string | null;
  requiresPrescription: boolean;
}

const rupeesStr = (p: number | null) => (p == null ? '' : (p / 100).toFixed(2));
const toPaise = (s: string) => (s.trim() === '' ? null : Math.round(Number(s) * 100));

function EditModal({ row, storeId, onClose, onSaved }: { row: Row; storeId: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    stockQty: String(row.stockQty),
    price: rupeesStr(row.price),
    wholesalePrice: rupeesStr(row.wholesalePrice),
    minOrderQty: String(row.minOrderQty),
    lowStockThreshold: String(row.lowStockThreshold),
    batchNumber: row.batchNumber ?? '',
    expiryDate: row.expiryDate?.slice(0, 10) ?? '',
    reason: '',
  });
  const [available, setAvailable] = useState(row.isAvailable);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title={`${row.productName} (${row.variantName})`}>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          setErrors({});
          try {
            await api(`/seller/stores/${storeId}/inventory/${row.id}`, {
              method: 'PATCH',
              body: {
                stockQty: Number(f.stockQty),
                price: toPaise(f.price) ?? undefined,
                wholesalePrice: toPaise(f.wholesalePrice),
                minOrderQty: Number(f.minOrderQty) || 1,
                lowStockThreshold: Number(f.lowStockThreshold),
                isAvailable: available,
                batchNumber: f.batchNumber || null,
                expiryDate: f.expiryDate ? new Date(f.expiryDate).toISOString() : null,
                reason: f.reason || undefined,
              },
            });
            onSaved();
          } catch (e) {
            setErrors((e as ApiError).details?.fields ?? {});
            setErr((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="text-sm text-navy-700/80 sm:col-span-2">
          SKU {row.sku} · MRP {money(row.mrp)}
        </p>
        <Input label="Stock quantity" type="number" min={0} value={f.stockQty} onChange={set('stockQty')} />
        <Input label="Low-stock alert at" type="number" min={0} value={f.lowStockThreshold} onChange={set('lowStockThreshold')} />
        <Input label="Retail price ₹ (incl. GST)" inputMode="decimal" value={f.price} onChange={set('price')} error={errors.price} />
        <Input label="Wholesale price ₹ (excl. GST)" inputMode="decimal" value={f.wholesalePrice} onChange={set('wholesalePrice')} hint="Leave empty for no wholesale price" />
        <Input label="Wholesale minimum qty" type="number" min={1} value={f.minOrderQty} onChange={set('minOrderQty')} />
        <Input label="Batch number" value={f.batchNumber} onChange={set('batchNumber')} />
        <Input label="Expiry date" type="date" value={f.expiryDate} onChange={set('expiryDate')} />
        <Input label="Reason for stock change" value={f.reason} onChange={set('reason')} hint="Saved in the audit trail" />
        <div className="sm:col-span-2">
          <Checkbox label="Available for sale" checked={available} onChange={setAvailable} />
        </div>
        {err && <div className="sm:col-span-2"><Notice tone="red">{err}</Notice></div>}
        <div className="sm:col-span-2">
          <Button type="submit" block loading={busy}>
            Save changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function History({ row, storeId, onClose }: { row: Row; storeId: string; onClose: () => void }) {
  const h = useApi<{ history: { id: string; reason: string; delta: number; stockBefore: number; stockAfter: number; note: string | null; orderId: string | null; createdAt: string }[] }>(`/seller/stores/${storeId}/inventory/${row.id}/history`);
  return (
    <Modal open onClose={onClose} title={`Stock history · ${row.sku}`}>
      {h.loading && <Spinner />}
      <ul className="divide-y divide-navy-100 text-sm">
        {h.data?.history.map((e) => (
          <li key={e.id} className="flex justify-between gap-2 py-2">
            <span>
              {e.reason.replace(/_/g, ' ').toLowerCase()}
              {e.note && ` – ${e.note}`}
              <span className="block text-xs text-navy-700/60">{new Date(e.createdAt).toLocaleString('en-IN')}</span>
            </span>
            <span className={`tabular-nums ${e.delta < 0 ? 'text-red-700' : 'text-brand-700'}`}>
              {e.delta > 0 ? '+' : ''}
              {e.delta} → {e.stockAfter}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function ImportModal({ storeId, onClose, onDone }: { storeId: string; onClose: () => void; onDone: () => void }) {
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ imported: number; failed: number; results: { row: number; sku: string; ok: boolean; message?: string }[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title="Bulk update by CSV">
      <div className="space-y-3">
        <p className="text-sm text-navy-700/80">
          Download your current inventory, edit it in a spreadsheet, and upload it back. Columns: <code>sku, price_rupees, stock_qty, low_stock_threshold, is_available, wholesale_price_rupees, min_order_qty, batch_number, expiry_date</code>. Only SKUs already in the catalogue can be imported; add new products with the product form.
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          aria-label="Choose CSV file"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) setCsv(await file.text());
          }}
          className="block text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-navy-50 file:px-3 file:py-2 file:font-semibold"
        />
        <Textarea label="…or paste CSV" rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} />
        {err && <Notice tone="red">{err}</Notice>}
        {res && (
          <Notice tone={res.failed ? 'orange' : 'green'} title={`${res.imported} rows updated, ${res.failed} failed`}>
            <ul className="max-h-40 overflow-y-auto">
              {res.results.filter((r) => !r.ok).map((r) => (
                <li key={r.row}>
                  Row {r.row} ({r.sku || 'no SKU'}): {r.message}
                </li>
              ))}
            </ul>
          </Notice>
        )}
        <Button
          block
          loading={busy}
          disabled={!csv.trim()}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              const r = await api<NonNullable<typeof res>>(`/seller/stores/${storeId}/inventory/import`, { body: { csv } });
              setRes(r);
              onDone();
            } catch (e) {
              setErr((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Import
        </Button>
      </div>
    </Modal>
  );
}

function InventoryInner() {
  const { store } = useSellerStore();
  const toast = useToast();
  const [filter, setFilter] = useState<'all' | 'low' | 'out' | 'expiring'>('all');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const { data, error, loading, reload } = useApi<{ items: Row[] }>(store ? `/seller/stores/${store.id}/inventory?filter=${filter}${query ? `&q=${encodeURIComponent(query)}` : ''}` : null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [history, setHistory] = useState<Row | null>(null);
  const [importing, setImporting] = useState(false);
  const canManage = ['OWNER', 'MANAGER'].includes(store!.role);

  return (
    <>
      <PageTitle
        title="Inventory & prices"
        action={
          <div className="flex flex-wrap gap-2">
            <a href={`/api/seller/stores/${store!.id}/inventory.csv`} className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold ring-1 ring-navy-100 hover:bg-navy-50">
              <Download className="h-4 w-4" aria-hidden /> Export CSV
            </a>
            {canManage && (
              <Button variant="secondary" onClick={() => setImporting(true)}>
                <Upload className="h-4 w-4" aria-hidden /> Import CSV
              </Button>
            )}
            <LinkButton href="/seller/products/new">Add product</LinkButton>
          </div>
        }
      />
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Tabs value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'low', label: 'Low stock' }, { value: 'out', label: 'Out of stock' }, { value: 'expiring', label: 'Expiring in 30 days' }]} />
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setQuery(q); }}>
          <Input label="Search SKU or name" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button type="submit" variant="secondary" className="self-end">
            Search
          </Button>
        </form>
      </div>
      {loading && !data && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data?.items.length === 0 && <EmptyState icon="📦" title="No items match" />}
      {data && data.items.length > 0 && (
        <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-navy-100">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-navy-50 text-left text-xs uppercase text-navy-700">
              <tr>
                <th className="p-3">Product</th>
                <th className="p-3">SKU</th>
                <th className="p-3 text-right">MRP</th>
                <th className="p-3 text-right">Price</th>
                <th className="p-3 text-right">Wholesale</th>
                <th className="p-3 text-right">Stock</th>
                <th className="p-3">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {data.items.map((r) => {
                const expSoon = r.expiryDate && new Date(r.expiryDate).getTime() - Date.now() < 30 * 86400_000;
                return (
                  <tr key={r.id} className={!r.isAvailable ? 'opacity-60' : ''}>
                    <td className="p-3">
                      <span className="font-semibold">{r.productName}</span> <span className="text-navy-700/70">({r.variantName})</span>
                      {r.requiresPrescription && <Badge tone="orange" className="ml-1">Rx</Badge>}
                      {r.expiryDate && <span className={`block text-xs ${expSoon ? 'text-red-700' : 'text-navy-700/60'}`}>Exp. {new Date(r.expiryDate).toLocaleDateString('en-IN')}{r.batchNumber && ` · batch ${r.batchNumber}`}</span>}
                    </td>
                    <td className="p-3 font-mono text-xs">{r.sku}</td>
                    <td className="p-3 text-right tabular-nums">{money(r.mrp)}</td>
                    <td className="p-3 text-right tabular-nums">{money(r.price)}</td>
                    <td className="p-3 text-right tabular-nums">{r.wholesalePrice != null ? `${money(r.wholesalePrice)} (min ${r.minOrderQty})` : '—'}</td>
                    <td className="p-3 text-right font-semibold tabular-nums">{r.stockQty}</td>
                    <td className="p-3">
                      {!r.isAvailable ? <Badge tone="gray">Hidden</Badge> : r.stockQty === 0 ? <Badge tone="red">Out</Badge> : r.stockQty <= r.lowStockThreshold ? <Badge tone="orange">Low</Badge> : <Badge tone="green">OK</Badge>}
                    </td>
                    <td className="whitespace-nowrap p-3">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setHistory(r)}>
                        History
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && <EditModal row={editing} storeId={store!.id} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast.show('Inventory updated'); void reload(); }} />}
      {history && <History row={history} storeId={store!.id} onClose={() => setHistory(null)} />}
      {importing && <ImportModal storeId={store!.id} onClose={() => setImporting(false)} onDone={() => void reload()} />}
    </>
  );
}

export default function InventoryPage() {
  return (
    <SellerShell>
      <InventoryInner />
    </SellerShell>
  );
}
