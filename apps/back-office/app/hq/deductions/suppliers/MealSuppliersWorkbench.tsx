'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
} from 'lucide-react';
import StaffPortalLoading from '../../../../components/portal/StaffPortalLoading';
import {
  archiveMealSupplier,
  getMealSupplierMonthlyOwed,
  listMealSuppliers,
  restoreMealSupplier,
  upsertMealSupplier,
} from '../actions';
import type { MealSupplierMonthOwed, MealSupplierRow } from '../lib/types';

function formatLkr(n: number) {
  return n.toLocaleString('en-LK', { maximumFractionDigits: 0 });
}

function SupplierForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: MealSupplierRow;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [bankName, setBankName] = useState(initial?.bankName ?? '');
  const [bankBranch, setBankBranch] = useState(initial?.bankBranch ?? '');
  const [accountName, setAccountName] = useState(initial?.accountName ?? '');
  const [accountNumber, setAccountNumber] = useState(initial?.accountNumber ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Supplier name is required.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await upsertMealSupplier({
      id: initial?.id,
      name,
      address,
      phone,
      bankName,
      bankBranch,
      accountName,
      accountNumber,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'Save failed');
      return;
    }
    onSaved();
  };

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="rounded-2xl border border-indigo-100 bg-indigo-50/30 p-5 space-y-4"
    >
      <h3 className="text-sm font-black text-slate-900">
        {initial ? 'Edit supplier' : 'New meal supplier'}
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="text-[9px] font-bold uppercase text-slate-500">Name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="sm:col-span-2">
          <span className="text-[9px] font-bold uppercase text-slate-500">Address</span>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label>
          <span className="text-[9px] font-bold uppercase text-slate-500">Phone</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label>
          <span className="text-[9px] font-bold uppercase text-slate-500">Bank</span>
          <input
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label>
          <span className="text-[9px] font-bold uppercase text-slate-500">Branch</span>
          <input
            value={bankBranch}
            onChange={(e) => setBankBranch(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label>
          <span className="text-[9px] font-bold uppercase text-slate-500">Account name</span>
          <input
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="sm:col-span-2">
          <span className="text-[9px] font-bold uppercase text-slate-500">Account number</span>
          <input
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
          />
        </label>
      </div>
      {error ? <p className="text-xs font-semibold text-rose-700">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold uppercase text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold uppercase text-slate-600"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function SupplierCard({
  supplier,
  isDemo,
  onUpdated,
}: {
  supplier: MealSupplierRow;
  isDemo: boolean;
  onUpdated: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<MealSupplierMonthOwed[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadHistory = async () => {
    if (history !== null) {
      setExpanded((e) => !e);
      return;
    }
    setHistoryLoading(true);
    const rows = await getMealSupplierMonthlyOwed(supplier.id);
    setHistory(rows);
    setHistoryLoading(false);
    setExpanded(true);
  };

  const archive = async () => {
    if (isDemo || !window.confirm(`Archive ${supplier.name}?`)) return;
    setBusy(true);
    await archiveMealSupplier(supplier.id);
    setBusy(false);
    onUpdated();
  };

  const restore = async () => {
    if (isDemo) return;
    setBusy(true);
    await restoreMealSupplier(supplier.id);
    setBusy(false);
    onUpdated();
  };

  const currentOwed = history?.[0]?.totalMealsLkr ?? null;

  return (
    <article
      className={`rounded-2xl border bg-white p-4 shadow-sm ring-1 ${
        supplier.status === 'ARCHIVED'
          ? 'border-slate-200 opacity-75 ring-slate-100'
          : 'border-slate-200/80 ring-slate-100'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-black text-slate-900">{supplier.name}</h3>
          {supplier.phone ? (
            <p className="text-xs text-slate-500">{supplier.phone}</p>
          ) : null}
          {supplier.status === 'ARCHIVED' && (
            <span className="mt-1 inline-block rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase text-slate-600">
              Archived
            </span>
          )}
        </div>
        {currentOwed != null && expanded && (
          <p className="font-mono text-sm font-bold text-indigo-800">
            Latest month: LKR {formatLkr(currentOwed)}
          </p>
        )}
      </div>

      {(supplier.address || supplier.bankName) && (
        <div className="mt-2 text-xs text-slate-600 space-y-0.5">
          {supplier.address ? <p>{supplier.address}</p> : null}
          {supplier.bankName ? (
            <p>
              {supplier.bankName}
              {supplier.bankBranch ? ` · ${supplier.bankBranch}` : ''}
              {supplier.accountNumber ? ` · ${supplier.accountNumber}` : ''}
            </p>
          ) : null}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void loadHistory()}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-bold uppercase text-slate-700 hover:bg-slate-50"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          Monthly owed
        </button>
        {!isDemo && supplier.status === 'ACTIVE' && (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-bold uppercase text-slate-700 hover:bg-slate-50"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => void archive()}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-[10px] font-bold uppercase text-rose-700 hover:bg-rose-50 disabled:opacity-50"
            >
              <Archive className="h-3.5 w-3.5" />
              Archive
            </button>
          </>
        )}
        {!isDemo && supplier.status === 'ARCHIVED' && (
          <button
            type="button"
            onClick={() => void restore()}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-[10px] font-bold uppercase text-emerald-800 hover:bg-emerald-50"
          >
            <ArchiveRestore className="h-3.5 w-3.5" />
            Restore
          </button>
        )}
      </div>

      {editing && (
        <div className="mt-4">
          <SupplierForm
            initial={supplier}
            onSaved={() => {
              setEditing(false);
              onUpdated();
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}

      {expanded && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          {historyLoading ? (
            <StaffPortalLoading portal="hq" message="Loading history…" className="min-h-[6rem] py-4" />
          ) : !history?.length ? (
            <p className="text-xs text-slate-500">No approved meal deductions linked to this supplier yet.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[9px] font-bold uppercase text-slate-500">
                  <th className="py-1">Month</th>
                  <th className="py-1 text-right">Guards</th>
                  <th className="py-1 text-right">Meals LKR</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.payrollMonth} className="border-t border-slate-50">
                    <td className="py-2 font-semibold text-slate-800">{h.payrollMonthLabel}</td>
                    <td className="py-2 text-right font-mono text-slate-600">{h.guardCount}</td>
                    <td className="py-2 text-right font-mono font-bold text-indigo-800">
                      {formatLkr(h.totalMealsLkr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </article>
  );
}

export default function MealSuppliersWorkbench({
  initialSuppliers,
  initialIsDemo,
}: {
  initialSuppliers: MealSupplierRow[];
  initialIsDemo: boolean;
}) {
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [isDemo, setIsDemo] = useState(initialIsDemo);
  const [showArchived, setShowArchived] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { suppliers: list, isDemo: demo } = await listMealSuppliers(showArchived);
    setSuppliers(list);
    setIsDemo(demo);
    setLoading(false);
  }, [showArchived]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const active = suppliers.filter((s) => s.status === 'ACTIVE');
  const archived = suppliers.filter((s) => s.status === 'ARCHIVED');

  return (
    <div className="space-y-4">
      {isDemo && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          Meal supplier tables are not migrated. Run{' '}
          <code className="text-xs">npm run db:apply-deductions-admin</code>, then add suppliers
          here.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold uppercase text-white hover:bg-indigo-500"
        >
          <Plus className="h-4 w-4" />
          Add supplier
        </button>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="ml-auto inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold uppercase text-slate-600"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      {showNew && (
        <SupplierForm
          onSaved={() => {
            setShowNew(false);
            void refresh();
          }}
          onCancel={() => setShowNew(false)}
        />
      )}

      <section className="space-y-3">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">
          Active ({active.length})
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {active.map((s) => (
            <SupplierCard key={s.id} supplier={s} isDemo={isDemo} onUpdated={() => void refresh()} />
          ))}
          {active.length === 0 && (
            <p className="text-sm text-slate-500 col-span-full">No active meal suppliers.</p>
          )}
        </div>
      </section>

      {showArchived && archived.length > 0 && (
        <section className="space-y-3 pt-4">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">
            Archived ({archived.length})
          </h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {archived.map((s) => (
              <SupplierCard key={s.id} supplier={s} isDemo={isDemo} onUpdated={() => void refresh()} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
