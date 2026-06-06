'use client';

import { useCallback, useState } from 'react';
import { Building2, CheckCircle2, Loader2, RefreshCw, UserMinus } from 'lucide-react';
import {
  assignSiteMealSupplier,
  clearSiteMealSupplier,
  getSiteMealAssignments,
} from '../actions';
import type { MealSupplierRow, SiteMealAssignmentRow } from '../lib/types';

function SiteAssignmentCard({
  row,
  suppliers,
  isDemo,
  onUpdated,
}: {
  row: SiteMealAssignmentRow;
  suppliers: MealSupplierRow[];
  isDemo: boolean;
  onUpdated: () => void;
}) {
  const [selected, setSelected] = useState(row.mealSupplierId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const save = async () => {
    if (isDemo) {
      setError('Preview mode — assignments disabled until live data exists.');
      return;
    }
    if (!selected) {
      setError('Select a meal supplier.');
      return;
    }
    setError(null);
    setDone(false);
    setBusy(true);
    const result = await assignSiteMealSupplier({
      siteProfileId: row.siteProfileId,
      mealSupplierId: selected,
    });
    setBusy(false);
    if (!result.success) {
      setError(result.error ?? 'Failed');
      return;
    }
    setDone(true);
    onUpdated();
  };

  const clear = async () => {
    if (isDemo) {
      setError('Preview mode — assignments disabled.');
      return;
    }
    setBusy(true);
    const result = await clearSiteMealSupplier(row.siteProfileId);
    setBusy(false);
    if (!result.success) {
      setError(result.error ?? 'Failed');
      return;
    }
    setSelected('');
    onUpdated();
  };

  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-black text-slate-900">{row.siteName}</h3>
          {row.address ? (
            <p className="mt-0.5 truncate text-xs text-slate-500">{row.address}</p>
          ) : null}
        </div>
        {row.mealSupplierName ? (
          <span className="shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[9px] font-black uppercase text-indigo-800">
            {row.mealSupplierName}
          </span>
        ) : (
          <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase text-amber-900">
            Unassigned
          </span>
        )}
      </div>

      <div className="mt-3">
        <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-slate-500">
          Meal supplier
        </label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-3 pr-8 text-xs font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        >
          <option value="">— Select supplier —</option>
          {suppliers
            .filter((s) => s.status === 'ACTIVE')
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
      </div>

      {error ? <p className="mt-2 text-xs font-semibold text-rose-700">{error}</p> : null}
      {done ? (
        <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> Saved
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-[10px] font-bold uppercase text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Building2 className="h-3.5 w-3.5" />}
          Save assignment
        </button>
        {row.assignmentId && (
          <button
            type="button"
            onClick={() => void clear()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold uppercase text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <UserMinus className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>
    </article>
  );
}

export default function SiteMealSupplierWorkbench({
  initialRows,
  initialSuppliers,
  initialIsDemo,
}: {
  initialRows: SiteMealAssignmentRow[];
  initialSuppliers: MealSupplierRow[];
  initialIsDemo: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [isDemo, setIsDemo] = useState(initialIsDemo);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const data = await getSiteMealAssignments();
    setRows(data.rows);
    setSuppliers(data.suppliers);
    setIsDemo(data.isDemo);
    setLoading(false);
  }, []);

  const unassigned = rows.filter((r) => !r.mealSupplierId);

  return (
    <div className="space-y-4">
      {isDemo && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          Preview sites from the FM ledger. Add meal suppliers on the Meal suppliers tab, then
          assign here once migrations are applied.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          <span className="font-bold text-slate-900">{rows.length}</span> sites ·{' '}
          <span className="font-bold text-amber-800">{unassigned.length}</span> without a supplier
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold uppercase text-slate-600 hover:bg-slate-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {rows.map((row) => (
          <SiteAssignmentCard
            key={row.siteProfileId}
            row={row}
            suppliers={suppliers}
            isDemo={isDemo}
            onUpdated={() => void refresh()}
          />
        ))}
      </div>
    </div>
  );
}
