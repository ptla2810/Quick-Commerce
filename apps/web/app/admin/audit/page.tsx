'use client';

import { useState } from 'react';
import { AdminShell } from '@/components/admin';
import { useApi } from '@/lib/api';
import { Button, PageTitle, Select, Spinner } from '@/components/ui';

interface Log { id: string; action: string; entityType: string; entityId: string | null; metadata: unknown; ip: string | null; createdAt: string; actor: { name: string } | null }

export default function AuditPage() {
  const [entity, setEntity] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading } = useApi<{ logs: Log[] }>(`/admin/audit-logs?page=${page}${entity ? `&entityType=${entity}` : ''}`);
  return (
    <AdminShell>
      <PageTitle title="Audit log" subtitle="Sensitive administrative, pharmacy and file-access actions" />
      <div className="mb-3 w-60">
        <Select label="Entity" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }}>
          <option value="">All</option>
          {['SellerOrg', 'BusinessProfile', 'DeliveryPartner', 'Prescription', 'StoredFile', 'Order', 'Coupon', 'PlatformSetting', 'Settlement', 'ReturnRequest', 'User', 'Store', 'Product'].map((e) => <option key={e}>{e}</option>)}
        </Select>
      </div>
      {loading && <Spinner />}
      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-navy-100">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-navy-50 text-left text-xs uppercase"><tr><th className="p-3">When</th><th className="p-3">Who</th><th className="p-3">Action</th><th className="p-3">Entity</th><th className="p-3">Details</th></tr></thead>
          <tbody className="divide-y divide-navy-100">
            {data?.logs.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap p-3 text-xs">{new Date(l.createdAt).toLocaleString('en-IN')}</td>
                <td className="p-3">{l.actor?.name ?? 'system'}</td>
                <td className="p-3 font-mono text-xs">{l.action}</td>
                <td className="p-3 text-xs">{l.entityType} {l.entityId?.slice(0, 10)}</td>
                <td className="max-w-xs truncate p-3 font-mono text-xs" title={JSON.stringify(l.metadata)}>{l.metadata ? JSON.stringify(l.metadata) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Newer</Button>
        <Button size="sm" variant="secondary" disabled={(data?.logs.length ?? 0) < 50} onClick={() => setPage(page + 1)}>Older</Button>
      </div>
    </AdminShell>
  );
}
