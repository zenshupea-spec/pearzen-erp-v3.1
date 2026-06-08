'use client';

import React, { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { formatLkr } from '../../../lib/saas-billing';
import {
  fetchSaasBillingDashboard,
  generateSaasInvoice,
  markSaasInvoicePaid,
  saveSaasBillingSettings,
} from './actions';

export default function SaasBillingPage() {
  const [companyName, setCompanyName] = useState('Classic Venture');
  const [databaseCost, setDatabaseCost] = useState('0');
  const [frontendCost, setFrontendCost] = useState('0');
  const [perEmployeePrice, setPerEmployeePrice] = useState('0');
  const [billingStartDate, setBillingStartDate] = useState('');
  const [employeeCount, setEmployeeCount] = useState(0);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const previewTotal = useMemo(() => {
    const db = Number(databaseCost) || 0;
    const fe = Number(frontendCost) || 0;
    const per = Number(perEmployeePrice) || 0;
    return db + fe + employeeCount * per;
  }, [databaseCost, frontendCost, perEmployeePrice, employeeCount]);

  const load = async () => {
    setIsLoading(true);
    const result = await fetchSaasBillingDashboard();
    if (result.success) {
      setLoadError(null);
      setCompanyName(result.company?.name ?? 'Classic Venture');
      setDatabaseCost(String(result.settings.databaseCostLkr));
      setFrontendCost(String(result.settings.frontendCostLkr));
      setPerEmployeePrice(String(result.settings.perEmployeePriceLkr));
      setBillingStartDate(result.settings.billingStartDate);
      setEmployeeCount(result.employeeCount);
      setInvoices(result.invoices);
    } else {
      setLoadError(result.error ?? 'Failed to load billing');
    }
    setIsLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = () => {
    startTransition(async () => {
      const result = await saveSaasBillingSettings({
        databaseCostLkr: Number(databaseCost) || 0,
        frontendCostLkr: Number(frontendCost) || 0,
        perEmployeePriceLkr: Number(perEmployeePrice) || 0,
        billingStartDate: billingStartDate || new Date().toISOString().slice(0, 10),
      });
      if (!result.success) {
        setSaveMessage(result.error ?? 'Failed to save');
        return;
      }
      setSaveMessage('Pricing saved.');
      await load();
    });
  };

  const handleGenerate = () => {
    startTransition(async () => {
      const result = await generateSaasInvoice();
      if (!result.success) {
        alert(result.error ?? 'Failed to generate invoice');
        return;
      }
      await load();
    });
  };

  const handleMarkPaid = (invoiceId: string) => {
    startTransition(async () => {
      const result = await markSaasInvoicePaid(invoiceId);
      if (!result.success) {
        alert(result.error ?? 'Failed to update');
        return;
      }
      await load();
    });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0e] text-slate-200 font-sans pb-20">
      <div className="bg-[#111118] border-b border-rose-500/20 sticky top-0 z-50 px-6 py-4 flex items-center gap-4 shadow-lg">
        <Link href="/forge" className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-black text-white tracking-tight uppercase">Platform Billing</h1>
          <p className="text-[10px] text-rose-400 font-mono font-bold uppercase tracking-widest mt-0.5">
            {companyName} · Pearzen.tech
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {loadError ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
            {loadError}
          </div>
        ) : null}
        {saveMessage ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            {saveMessage}
          </div>
        ) : null}

        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 text-sm text-indigo-200">
          Single-tenant billing. Invoices appear in FM → <strong>Pearzen.tech payment</strong>.
          On the due date (and while overdue), FM sees a payment notice and the invoice card flashes — no advance reminders on other portals.
          Portals stay online until you mark the invoice paid in Forge.
        </div>

        <div className="bg-[#111118] border border-slate-800 rounded-2xl p-6 space-y-5">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Pricing</h2>
          {isLoading ? (
            <p className="text-slate-500 animate-pulse font-mono text-sm">Loading…</p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-1">
                  <span className="text-xs font-bold text-slate-500 uppercase">Database cost (LKR)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={databaseCost}
                    onChange={(e) => setDatabaseCost(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#0a0a0e] px-3 py-2 text-white"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-bold text-slate-500 uppercase">Frontend cost (LKR)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={frontendCost}
                    onChange={(e) => setFrontendCost(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#0a0a0e] px-3 py-2 text-white"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-bold text-slate-500 uppercase">Per employee price (LKR)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={perEmployeePrice}
                    onChange={(e) => setPerEmployeePrice(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#0a0a0e] px-3 py-2 text-white"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-bold text-slate-500 uppercase">Billing start date (monthly anchor)</span>
                  <input
                    type="date"
                    value={billingStartDate}
                    onChange={(e) => setBillingStartDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-[#0a0a0e] px-3 py-2 text-white"
                  />
                </label>
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#0a0a0e] p-4 text-sm">
                <p className="text-slate-400">
                  MNR active employees: <span className="font-bold text-white">{employeeCount}</span>
                </p>
                <p className="text-slate-400 mt-1">
                  Employee line: {formatLkr((Number(perEmployeePrice) || 0) * employeeCount)}
                </p>
                <p className="text-white font-bold mt-2">Invoice preview: {formatLkr(previewTotal)}</p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isPending}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  Save pricing
                </button>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isPending}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-rose-500 disabled:opacity-50"
                >
                  Generate invoice
                </button>
              </div>
            </>
          )}
        </div>

        <div className="bg-[#111118] border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Invoices</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0a0a0e] text-slate-500 text-xs uppercase">
                <tr>
                  <th className="px-6 py-3">Due date</th>
                  <th className="px-6 py-3">Employees</th>
                  <th className="px-6 py-3">Total</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Receipt</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-slate-500">
                      No invoices yet. Save pricing and generate the first invoice.
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="px-6 py-4 font-mono text-xs">{inv.dueDate}</td>
                      <td className="px-6 py-4">{inv.employeeCount}</td>
                      <td className="px-6 py-4 font-bold">{formatLkr(inv.totalLkr)}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${inv.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-300'}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {inv.receiptUrl ? (
                          <a
                            href={inv.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-bold text-indigo-400 hover:text-white uppercase"
                          >
                            View receipt
                          </a>
                        ) : (
                          <span className="text-xs text-slate-500">Awaiting FM upload</span>
                        )}
                        {inv.receiptUploadedAt ? (
                          <p className="mt-1 text-[10px] text-slate-500">
                            {new Date(inv.receiptUploadedAt).toLocaleString()}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {inv.status === 'unpaid' ? (
                          <button
                            type="button"
                            onClick={() => handleMarkPaid(inv.id)}
                            disabled={isPending}
                            className="text-xs font-bold text-emerald-400 hover:text-white uppercase"
                          >
                            Mark paid
                          </button>
                        ) : (
                          <span className="text-xs text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
