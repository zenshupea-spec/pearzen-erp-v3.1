'use client';

import { useMemo, useState } from 'react';
import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';
import {
  getCafeCustomers,
  updateCafeCustomerDiscount,
  type CafeCustomerRow,
} from './actions';

function formatPhoneDisplay(phone: string): string {
  if (phone.length === 10 && phone.startsWith('0')) {
    return `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}`;
  }
  return phone;
}

function formatLastOrder(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function CafeCustomersPanel({
  initialCustomers,
  loadError,
}: {
  initialCustomers: CafeCustomerRow[];
  loadError?: string | null;
}) {
  const [customers, setCustomers] = useState(initialCustomers);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draftDiscounts, setDraftDiscounts] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const totalRevenue = useMemo(
    () => customers.reduce((sum, row) => sum + row.totalSpentLkr, 0),
    [customers],
  );

  const refresh = async () => {
    setRefreshing(true);
    setActionError(null);
    const payload = await getCafeCustomers();
    if (payload.error) setActionError(payload.error);
    setCustomers(payload.customers);
    setRefreshing(false);
  };

  const saveDiscount = async (customer: CafeCustomerRow) => {
    const raw = draftDiscounts[customer.id] ?? String(customer.discountPct);
    const discountPct = Number(raw);
    if (!Number.isFinite(discountPct) || discountPct < 0 || discountPct > 100) {
      setActionError('Discount must be between 0 and 100.');
      return;
    }

    setSavingId(customer.id);
    setActionError(null);
    const result = await updateCafeCustomerDiscount({ customerId: customer.id, discountPct });
    if (!result.ok) {
      setActionError(result.error ?? 'Could not save discount.');
      setSavingId(null);
      return;
    }

    setCustomers((rows) =>
      rows.map((row) => (row.id === customer.id ? { ...row, discountPct } : row)),
    );
    setDraftDiscounts((prev) => {
      const next = { ...prev };
      delete next[customer.id];
      return next;
    });
    setSavingId(null);
  };

  return (
    <ExecutiveGlassCard className="overflow-hidden">
      <div className="border-b border-slate-200/70 bg-slate-50/50 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-800">
              Customer registry
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Spend counts after staff accept an order · set loyalty discounts for their next visit
            </p>
          </div>
          <div className="flex items-center gap-3 text-right">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Lifetime spend
              </p>
              <p className="text-lg font-black text-slate-900">
                LKR {totalRevenue.toLocaleString()}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {loadError || actionError ? (
        <div className="border-b border-rose-200/80 bg-rose-50/60 px-5 py-3 text-xs text-rose-800">
          {loadError ?? actionError}
        </div>
      ) : null}

      {customers.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-slate-500">
          No customers yet. They appear here after the first order with a phone number.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200/80 bg-slate-50/60 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3 text-right">Orders</th>
                <th className="px-4 py-3 text-right">Total spent</th>
                <th className="px-4 py-3">Last order</th>
                <th className="px-4 py-3 text-center">Next-order discount</th>
                <th className="px-4 py-3 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60">
              {customers.map((customer) => {
                const draft = draftDiscounts[customer.id];
                const discountValue = draft ?? String(customer.discountPct);
                const dirty = draft !== undefined && Number(draft) !== customer.discountPct;

                return (
                  <tr key={customer.id} className="hover:bg-white/50">
                    <td className="px-4 py-3 font-bold text-slate-900">{customer.customerName || '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {formatPhoneDisplay(customer.customerPhone)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {customer.orderCount}
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">
                      LKR {customer.totalSpentLkr.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {formatLastOrder(customer.lastOrderAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="mx-auto flex max-w-[7rem] items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={discountValue}
                          onChange={(e) =>
                            setDraftDiscounts((prev) => ({
                              ...prev,
                              [customer.id]: e.target.value,
                            }))
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                        />
                        <span className="text-[10px] font-bold text-slate-500">%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => void saveDiscount(customer)}
                        disabled={savingId === customer.id || !dirty}
                        className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                      >
                        {savingId === customer.id ? '…' : 'Save'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ExecutiveGlassCard>
  );
}
