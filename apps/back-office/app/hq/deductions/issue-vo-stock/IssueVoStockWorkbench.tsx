'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Loader2, PackagePlus, Plus, Shirt, Trash2 } from 'lucide-react';
import {
  getHolderUniformVoStock,
  issueUniformVoStockBatch,
} from '../actions';
import type {
  UniformStockItemRow,
  UniformVoHolderOption,
  UniformVoHolderRole,
  UniformVoStockRow,
} from '../lib/types';

type IssueLine = { id: string; stockItemId: string; quantity: string };

function roleBadgeClass(role: UniformVoHolderRole) {
  switch (role) {
    case 'SM':
      return 'bg-emerald-100 text-emerald-800';
    case 'TM':
      return 'bg-violet-100 text-violet-800';
    case 'OM':
      return 'bg-sky-100 text-sky-800';
  }
}

function newLine(inStock: UniformStockItemRow[]): IssueLine {
  return {
    id: crypto.randomUUID(),
    stockItemId: inStock[0]?.id ?? '',
    quantity: '1',
  };
}

export default function IssueVoStockWorkbench({
  warehouseItems,
  warehouseDemo,
  holders,
  holdersDemo,
}: {
  warehouseItems: UniformStockItemRow[];
  warehouseDemo: boolean;
  holders: UniformVoHolderOption[];
  holdersDemo: boolean;
}) {
  const inStock = useMemo(
    () => warehouseItems.filter((i) => i.quantityInStock > 0),
    [warehouseItems],
  );

  const [roleFilter, setRoleFilter] = useState<UniformVoHolderRole | 'ALL'>('ALL');
  const [holderEpf, setHolderEpf] = useState('');
  const [holderStock, setHolderStock] = useState<UniformVoStockRow[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [lines, setLines] = useState<IssueLine[]>(() => [newLine(inStock)]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const filteredHolders = useMemo(() => {
    if (roleFilter === 'ALL') return holders;
    return holders.filter((h) => h.role === roleFilter);
  }, [holders, roleFilter]);

  const selectedHolder = holders.find((h) => h.epf === holderEpf);

  const loadHolderStock = useCallback(async (epf: string) => {
    if (!epf) {
      setHolderStock([]);
      return;
    }
    setLoadingStock(true);
    const rows = await getHolderUniformVoStock(epf);
    setHolderStock(rows);
    setLoadingStock(false);
  }, []);

  useEffect(() => {
    if (!holderEpf && filteredHolders[0]) {
      setHolderEpf(filteredHolders[0].epf);
    }
  }, [filteredHolders, holderEpf]);

  useEffect(() => {
    void loadHolderStock(holderEpf);
  }, [holderEpf, loadHolderStock]);

  useEffect(() => {
    if (inStock.length > 0 && lines.every((l) => !l.stockItemId)) {
      setLines([newLine(inStock)]);
    }
  }, [inStock, lines]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (warehouseDemo || holdersDemo) {
      setError('Preview mode — run migrations first.');
      return;
    }
    if (!holderEpf) {
      setError('Select an SM, TM, or OM.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);

    const res = await issueUniformVoStockBatch({
      holderEpf,
      lines: lines.map((l) => ({
        stockItemId: l.stockItemId,
        quantity: parseInt(l.quantity, 10) || 0,
      })),
    });

    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'Issue failed');
      return;
    }

    const name = selectedHolder?.fullName ?? holderEpf;
    setMessage(
      `Issued ${res.issuedCount ?? lines.length} line(s) to ${name} (${holderEpf}) for stock on hand.`,
    );
    setLines([newLine(inStock)]);
    void loadHolderStock(holderEpf);
  };

  if (inStock.length === 0) {
    return (
      <div className="space-y-4">
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          No HQ warehouse stock available. Add items on{' '}
          <Link href="/hq/deductions/uniform-suppliers" className="font-bold underline">
            Uniform stock
          </Link>{' '}
          before issuing to field staff.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-violet-200 bg-violet-50">
            <PackagePlus className="h-5 w-5 text-violet-700" />
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tight text-slate-900">
              Issue stock on hand
            </h2>
            <p className="mt-1 max-w-xl text-sm text-slate-600">
              Transfer uniform from HQ warehouse into an SM, TM, or OM holder. They issue to guards
              from <span className="font-semibold">my stock on hand</span> on their uniform page.
            </p>
          </div>
        </div>
        <Link
          href="/hq/deductions/uniform-issue"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-50"
        >
          <Shirt className="h-3.5 w-3.5" />
          Admin uniform issue
        </Link>
      </div>

      {(warehouseDemo || holdersDemo) && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          Uniform VO stock tables are not migrated. Run{' '}
          <code className="text-xs">npm run db:apply-deductions-admin</code> to issue live stock to
          SM/TM/OM holders.
        </p>
      )}

      <form onSubmit={(e) => void submit(e)} className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">
            Select holder
          </h3>

          <div className="flex flex-wrap gap-2">
            {(['ALL', 'SM', 'TM', 'OM'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setRoleFilter(r);
                  setHolderEpf('');
                }}
                className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${
                  roleFilter === r
                    ? 'bg-indigo-600 text-white'
                    : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {r === 'ALL' ? 'All' : r}
              </button>
            ))}
          </div>

          <div className="relative">
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              SM / TM / OM
            </label>
            <select
              required
              value={holderEpf}
              onChange={(e) => setHolderEpf(e.target.value)}
              className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-3 pr-10 text-sm font-semibold text-slate-900"
            >
              <option value="" disabled>
                — Select by name —
              </option>
              {filteredHolders.map((h) => (
                <option key={h.epf} value={h.epf}>
                  {h.role} · {h.fullName} · {h.epf}
                  {h.detail ? ` · ${h.detail}` : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-[2.65rem] h-4 w-4 text-slate-400" />
          </div>

          {selectedHolder && (
            <p className="text-sm text-slate-600">
              <span
                className={`mr-2 rounded-md px-2 py-0.5 text-[10px] font-black uppercase ${roleBadgeClass(selectedHolder.role)}`}
              >
                {selectedHolder.role}
              </span>
              {selectedHolder.fullName}
              <span className="font-mono text-slate-500"> ({selectedHolder.epf})</span>
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-violet-200 bg-violet-50/40 p-5 space-y-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-violet-800">
            Their stock on hand now
          </h3>
          {loadingStock ? (
            <p className="flex items-center gap-2 text-sm text-violet-900/80">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          ) : holderStock.length === 0 ? (
            <p className="text-sm text-violet-900/80">Nothing issued yet for this holder.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {holderStock.map((row) => (
                <li
                  key={row.itemName}
                  className="rounded-lg border border-violet-200/80 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                >
                  <span className="block truncate">{row.itemName}</span>
                  <span className="font-mono text-sm text-violet-700 tabular-nums">
                    {row.quantityOnHand} on hand
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">
              Items from HQ warehouse
            </h3>
            <button
              type="button"
              onClick={() => setLines((prev) => [...prev, newLine(inStock)])}
              className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-black text-violet-700"
            >
              <Plus className="h-3.5 w-3.5" /> Add line
            </button>
          </div>

          <div className="space-y-3">
            {lines.map((line, index) => (
              <div
                key={line.id}
                className="grid gap-3 sm:grid-cols-[1fr_120px_40px] items-end"
              >
                <label className="block text-sm font-semibold text-slate-700">
                  Item
                  <select
                    value={line.stockItemId}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l) =>
                          l.id === line.id ? { ...l, stockItemId: e.target.value } : l,
                        ),
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    {inStock.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.itemName} ({item.quantityInStock} at HQ)
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Qty
                  <input
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l) =>
                          l.id === line.id ? { ...l, quantity: e.target.value } : l,
                        ),
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
                  />
                </label>
                {lines.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setLines((prev) => prev.filter((l) => l.id !== line.id))}
                    className="mb-0.5 rounded-lg border border-red-200 bg-red-50 p-2 text-red-600 hover:bg-red-100"
                    aria-label="Remove line"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : (
                  <div />
                )}
              </div>
            ))}
          </div>
        </section>

        {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
        {message && <p className="text-sm font-semibold text-emerald-800">{message}</p>}

        <button
          type="submit"
          disabled={busy || !holderEpf}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-black uppercase tracking-wide text-white shadow-md shadow-violet-600/20 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
          Issue to stock on hand
        </button>
      </form>
    </div>
  );
}
