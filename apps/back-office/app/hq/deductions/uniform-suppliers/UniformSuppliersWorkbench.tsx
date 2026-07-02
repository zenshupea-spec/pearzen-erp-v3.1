'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Loader2,
  Plus,
  RefreshCw,
  Shirt,
  Trash2,
} from 'lucide-react';
import {
  allocateUniformStockToVo,
  archiveUniformSupplier,
  deleteUniformStockItem,
  getUniformStockOverview,
  restoreUniformSupplier,
  upsertUniformStockItem,
  upsertUniformSupplier,
} from '../actions';
import type {
  UniformStockItemRow,
  UniformStockOverview,
  UniformSupplierRow,
  UniformVoHolderOption,
} from '../lib/types';

function formatLkr(n: number) {
  return n.toLocaleString('en-LK', { maximumFractionDigits: 0 });
}

function SupplierForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: UniformSupplierRow;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
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
    const res = await upsertUniformSupplier({
      id: initial?.id,
      name,
      address,
      phone,
      email,
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
      className="rounded-2xl border border-violet-100 bg-violet-50/30 p-5 space-y-4"
    >
      <h3 className="text-sm font-black text-slate-900">
        {initial ? 'Edit uniform supplier' : 'New uniform supplier'}
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
          <span className="text-[9px] font-bold uppercase text-slate-500">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
          className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold uppercase text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save supplier'}
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

function VoAllocateForm({
  items,
  holders,
  isDemo,
  onAllocated,
}: {
  items: UniformStockItemRow[];
  holders: UniformVoHolderOption[];
  isDemo: boolean;
  onAllocated: () => void;
}) {
  const inStock = useMemo(
    () => items.filter((i) => i.quantityInStock > 0),
    [items],
  );
  const [holderEpf, setHolderEpf] = useState('');
  const [stockItemId, setStockItemId] = useState('');
  const [qty, setQty] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!stockItemId && inStock[0]) setStockItemId(inStock[0].id);
  }, [inStock, stockItemId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemo) {
      setError('Preview mode — run migrations first.');
      return;
    }
    if (!holderEpf.trim()) {
      setError('Select an SM, TM, or OM.');
      return;
    }
    if (!stockItemId) {
      setError('Select a warehouse item.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await allocateUniformStockToVo({
      holderEpf,
      stockItemId,
      quantity: parseInt(qty, 10) || 0,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'Allocation failed');
      return;
    }
    setMessage(`Allocated to ${holderEpf.trim().toUpperCase()}.`);
    setHolderEpf('');
    setQty('1');
    onAllocated();
  };

  if (inStock.length === 0) return null;

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="rounded-2xl border border-violet-200 bg-violet-50/50 p-5 space-y-4"
    >
      <div>
        <h3 className="text-xs font-black uppercase tracking-widest text-violet-800">
          Allocate to VO — my stock on hand
        </h3>
        <p className="mt-1 text-sm text-violet-900/80">
          Transfer from HQ warehouse into a holder&apos;s stock (deducted when they issue uniform).
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm font-semibold text-slate-700">
          Holder (SM / TM / OM)
          <select
            value={holderEpf}
            onChange={(e) => setHolderEpf(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">— Select by name —</option>
            {holders.map((h) => (
              <option key={h.epf} value={h.epf}>
                {h.role} · {h.fullName} · {h.epf}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          Warehouse item
          <select
            value={stockItemId}
            onChange={(e) => setStockItemId(e.target.value)}
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
          Quantity
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
          />
        </label>
      </div>
      {error && (
        <p className="text-sm font-semibold text-red-700">{error}</p>
      )}
      {message && (
        <p className="text-sm font-semibold text-emerald-800">{message}</p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-black uppercase tracking-wide text-white disabled:opacity-50"
      >
        {busy ? 'Allocating…' : 'Allocate to holder'}
      </button>
    </form>
  );
}

function StockItemForm({
  suppliers,
  initial,
  onSaved,
  onCancel,
}: {
  suppliers: UniformSupplierRow[];
  initial?: UniformStockItemRow;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const activeSuppliers = suppliers.filter((s) => s.status === 'ACTIVE');
  const [itemName, setItemName] = useState(initial?.itemName ?? '');
  const [sku, setSku] = useState(initial?.sku ?? '');
  const [supplierId, setSupplierId] = useState(
    initial?.supplierId ?? activeSuppliers[0]?.id ?? '',
  );
  const [qty, setQty] = useState(String(initial?.quantityInStock ?? 0));
  const [unitCost, setUnitCost] = useState(
    initial?.unitCostLkr != null ? String(initial.unitCostLkr) : '',
  );
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSupplierId((current) => {
      if (initial?.supplierId && activeSuppliers.some((s) => s.id === initial.supplierId)) {
        return initial.supplierId;
      }
      if (current && activeSuppliers.some((s) => s.id === current)) {
        return current;
      }
      return activeSuppliers[0]?.id ?? '';
    });
  }, [suppliers, initial?.supplierId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) {
      setError('Item name is required.');
      return;
    }
    const resolvedSupplierId =
      supplierId && activeSuppliers.some((s) => s.id === supplierId)
        ? supplierId
        : activeSuppliers[0]?.id ?? '';
    if (!resolvedSupplierId) {
      setError('Select a supplier first.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await upsertUniformStockItem({
      id: initial?.id,
      itemName,
      uniformSupplierId: resolvedSupplierId,
      sku,
      quantityInStock: parseInt(qty, 10) || 0,
      unitCostLkr: unitCost ? parseFloat(unitCost) : undefined,
      notes,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'Save failed');
      return;
    }
    onSaved();
  };

  if (!activeSuppliers.length) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Add a uniform supplier before creating stock items.
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5 space-y-4"
    >
      <h3 className="text-sm font-black text-slate-900">
        {initial ? 'Edit stock item' : 'Add uniform item'}
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="text-[9px] font-bold uppercase text-slate-500">Item</span>
          <input
            required
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="e.g. Boots (Size 42)"
          />
        </label>
        <label>
          <span className="text-[9px] font-bold uppercase text-slate-500">SKU / code</span>
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
          />
        </label>
        <label>
          <span className="text-[9px] font-bold uppercase text-slate-500">Supplier</span>
          <select
            required
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            {activeSuppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-[9px] font-bold uppercase text-slate-500">In stock (qty)</span>
          <input
            type="number"
            min={0}
            step={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
          />
        </label>
        <label>
          <span className="text-[9px] font-bold uppercase text-slate-500">Unit cost (LKR)</span>
          <input
            type="number"
            min={0}
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
          />
        </label>
        <label className="sm:col-span-2">
          <span className="text-[9px] font-bold uppercase text-slate-500">Notes</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
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
          {busy ? 'Saving…' : 'Save item'}
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

export default function UniformSuppliersWorkbench({
  initial,
  holders,
}: {
  initial: UniformStockOverview;
  holders: UniformVoHolderOption[];
}) {
  const [overview, setOverview] = useState(initial);
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [showNewItem, setShowNewItem] = useState(false);
  const [editingItem, setEditingItem] = useState<UniformStockItemRow | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const next = await getUniformStockOverview();
    setOverview(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    setOverview(initial);
  }, [initial]);

  const lowStockItems = useMemo(
    () => overview.items.filter((i) => i.lowStock),
    [overview.items],
  );

  const activeSuppliers = overview.suppliers.filter((s) => s.status === 'ACTIVE');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-200 bg-violet-50">
          <Shirt className="h-5 w-5 text-violet-700" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-black text-slate-900">Uniform suppliers & stock</h2>
          <p className="text-sm text-slate-600">
            Track items, vendor contacts, and on-hand quantity. Rows in{' '}
            <span className="font-bold text-rose-700">red</span> are below the reorder minimum (
            active staff ÷ 10, minimum 1).
          </p>
        </div>
      </div>

      {overview.isDemo && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          Uniform stock tables are not migrated. Run{' '}
          <code className="text-xs">npm run db:apply-deductions-admin</code> to manage warehouse
          stock and suppliers.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-[9px] font-bold uppercase text-slate-500">Active employees</p>
          <p className="mt-1 font-mono text-xl font-black text-slate-900">
            {overview.activeEmployeeCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-[9px] font-bold uppercase text-slate-500">Reorder minimum / item</p>
          <p className="mt-1 font-mono text-xl font-black text-indigo-800">
            {overview.reorderMinQty}
          </p>
          <p className="text-[10px] text-slate-500">floor(staff ÷ 10), min 1</p>
        </div>
        <div
          className={`rounded-xl border px-4 py-3 shadow-sm ${
            lowStockItems.length
              ? 'border-rose-200 bg-rose-50'
              : 'border-emerald-200 bg-emerald-50/80'
          }`}
        >
          <p className="text-[9px] font-bold uppercase text-slate-500">Low stock items</p>
          <p
            className={`mt-1 font-mono text-xl font-black ${
              lowStockItems.length ? 'text-rose-800' : 'text-emerald-800'
            }`}
          >
            {lowStockItems.length}
          </p>
          {lowStockItems.length > 0 && (
            <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-rose-700">
              <AlertTriangle className="h-3 w-3" />
              Order more from supplier
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setShowNewSupplier(true);
            setShowNewItem(false);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold uppercase text-white hover:bg-violet-500"
        >
          <Plus className="h-4 w-4" />
          Add supplier
        </button>
        <button
          type="button"
          onClick={() => {
            setShowNewItem(true);
            setEditingItem(null);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold uppercase text-white hover:bg-indigo-500"
        >
          <Plus className="h-4 w-4" />
          Add item
        </button>
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

      {showNewSupplier && (
        <SupplierForm
          onSaved={() => {
            setShowNewSupplier(false);
            void refresh();
          }}
          onCancel={() => setShowNewSupplier(false)}
        />
      )}

      {(showNewItem || editingItem) && (
        <StockItemForm
          suppliers={overview.suppliers}
          initial={editingItem ?? undefined}
          onSaved={() => {
            setShowNewItem(false);
            setEditingItem(null);
            void refresh();
          }}
          onCancel={() => {
            setShowNewItem(false);
            setEditingItem(null);
          }}
        />
      )}

      <VoAllocateForm
        items={overview.items}
        holders={holders}
        isDemo={overview.isDemo}
        onAllocated={() => void refresh()}
      />

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">
            HQ warehouse stock ({overview.items.length})
          </h3>
        </div>
        {overview.items.length === 0 ? (
          <p className="px-4 py-8 text-sm text-slate-500">No uniform items yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-[9px] font-bold uppercase text-slate-500">
                  <th className="px-4 py-2">Item</th>
                  <th className="px-4 py-2">Supplier</th>
                  <th className="px-4 py-2 text-right">In stock</th>
                  <th className="px-4 py-2 text-right">Min</th>
                  <th className="px-4 py-2 text-right">Unit LKR</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {overview.items.map((item) => (
                  <tr
                    key={item.id}
                    className={`border-t border-slate-50 ${
                      item.lowStock
                        ? 'bg-rose-50 text-rose-950'
                        : 'text-slate-800'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-bold">{item.itemName}</p>
                      {item.sku ? (
                        <p className="font-mono text-[10px] text-slate-500">{item.sku}</p>
                      ) : null}
                      {item.lowStock && (
                        <p className="mt-1 flex items-center gap-1 text-[10px] font-bold uppercase text-rose-700">
                          <AlertTriangle className="h-3 w-3" />
                          Low stock — order more
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <p className="font-semibold">{item.supplierName}</p>
                      {item.supplierPhone ? (
                        <p className="text-slate-500">{item.supplierPhone}</p>
                      ) : null}
                      {item.supplierAddress ? (
                        <p className="text-slate-400">{item.supplierAddress}</p>
                      ) : null}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono text-base font-black ${
                        item.lowStock ? 'text-rose-800' : ''
                      }`}
                    >
                      {item.quantityInStock}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-500">
                      {overview.reorderMinQty}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600">
                      {item.unitCostLkr != null ? formatLkr(item.unitCostLkr) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {!overview.isDemo && (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingItem(item);
                              setShowNewItem(false);
                            }}
                            className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold uppercase hover:bg-white/80"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!window.confirm(`Remove ${item.itemName}?`)) return;
                              void deleteUniformStockItem(item.id).then(() => refresh());
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-[10px] font-bold uppercase text-rose-700 hover:bg-rose-100/50"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {activeSuppliers.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">
            Suppliers ({activeSuppliers.length})
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {activeSuppliers.map((s) => (
              <article
                key={s.id}
                className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm"
              >
                <p className="font-black text-slate-900">{s.name}</p>
                {s.phone ? <p className="text-xs text-slate-500">{s.phone}</p> : null}
                {s.email ? <p className="text-xs text-slate-500">{s.email}</p> : null}
                {s.address ? <p className="mt-1 text-xs text-slate-600">{s.address}</p> : null}
                {!overview.isDemo && s.status === 'ACTIVE' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm(`Archive ${s.name}?`)) return;
                      void archiveUniformSupplier(s.id).then(() => refresh());
                    }}
                    className="mt-2 text-[10px] font-bold uppercase text-rose-700 hover:underline"
                  >
                    Archive
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {overview.suppliers.some((s) => s.status === 'ARCHIVED') && !overview.isDemo && (
        <section className="text-xs text-slate-500">
          {overview.suppliers
            .filter((s) => s.status === 'ARCHIVED')
            .map((s) => (
              <p key={s.id} className="flex items-center gap-2">
                {s.name} (archived)
                <button
                  type="button"
                  onClick={() => void restoreUniformSupplier(s.id).then(() => refresh())}
                  className="font-bold text-emerald-700 hover:underline"
                >
                  Restore
                </button>
              </p>
            ))}
        </section>
      )}
    </div>
  );
}
