'use client';

import { useState } from 'react';

/** Single-series column chart: thin columns, rounded data end, hover tooltip and a table view. */
export function ColumnChart({ data, format, title, emptyText = 'No data in this period' }: { data: { label: string; value: number; detail?: string }[]; format: (v: number) => string; title: string; emptyText?: string }) {
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value), 1);
  const peak = data.reduce((best, d, i) => (d.value > (data[best]?.value ?? -1) ? i : best), 0);
  return (
    <figure>
      <div className="mb-2 flex items-center justify-between">
        <figcaption className="text-sm font-semibold text-navy-900">{title}</figcaption>
        <button className="text-xs font-semibold text-brand-700 underline" onClick={() => setTable((t) => !t)}>
          {table ? 'Show chart' : 'Show table'}
        </button>
      </div>
      {data.length === 0 ? (
        <p className="py-8 text-center text-sm text-navy-700/70">{emptyText}</p>
      ) : table ? (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-navy-100">
            {data.map((d) => (
              <tr key={d.label}>
                <td className="py-1">{d.label}</td>
                <td className="py-1 text-right tabular-nums">{format(d.value)}</td>
                {d.detail && <td className="py-1 text-right text-navy-700/70">{d.detail}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative">
          <div className="flex h-40 items-end gap-[2px] border-b border-navy-100" role="img" aria-label={`${title}. Highest: ${data[peak].label}, ${format(data[peak].value)}`}>
            {data.map((d, i) => (
              <div key={d.label} className="relative flex h-full flex-1 items-end justify-center" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={`${d.label}: ${format(d.value)}`}>
                <div className={`w-full max-w-6 rounded-t ${hover === i ? 'bg-brand-700' : 'bg-brand-500'}`} style={{ height: `${Math.max((d.value / max) * 100, d.value > 0 ? 2 : 0)}%` }} />
                {hover === i && (
                  <div className="pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-lg bg-navy-900 px-2 py-1 text-xs text-white shadow">
                    {d.label}: {format(d.value)}
                    {d.detail && ` · ${d.detail}`}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-navy-700/70">
            <span>{data[0].label}</span>
            <span>
              Peak {data[peak].label}: {format(data[peak].value)}
            </span>
            <span>{data[data.length - 1].label}</span>
          </div>
        </div>
      )}
    </figure>
  );
}

/** Horizontal bars with the label and value as text, so identity never depends on colour. */
export function BarList({ data, format, title }: { data: { label: string; value: number; detail?: string }[]; format: (v: number) => string; title: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <figure>
      <figcaption className="mb-2 text-sm font-semibold text-navy-900">{title}</figcaption>
      <ul className="space-y-2">
        {data.map((d) => (
          <li key={d.label} className="text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-navy-900">{d.label}</span>
              <span className="tabular-nums text-navy-700">
                {format(d.value)}
                {d.detail && <span className="text-navy-700/70"> · {d.detail}</span>}
              </span>
            </div>
            <div className="mt-1 h-2 rounded-r bg-navy-50">
              <div className="h-2 rounded-r bg-brand-500" style={{ width: `${(d.value / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </figure>
  );
}
