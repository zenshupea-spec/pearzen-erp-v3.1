'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import FmSubnav from '../components/FmSubnav';
import StaffPortalLoading from '../../../components/portal/StaffPortalLoading';
import {
  formatLkr,
  isInvoiceDueToday,
  isInvoiceOverdue,
  type SaasPlatformInvoice,
} from '../../../lib/saas-billing';
import {
  fetchFmSaasInvoices,
  uploadSaasPaymentReceipt,
} from '../../forge/billing/actions';

function ReceiptUploadPanel({
  invoice,
  onUploaded,
}: {
  invoice: SaasPlatformInvoice;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const handleUpload = () => {
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setMessage('Choose a receipt file first.');
      return;
    }

    const formData = new FormData();
    formData.set('invoiceId', invoice.id);
    formData.set('file', file);

    startTransition(async () => {
      const result = await uploadSaasPaymentReceipt(formData);
      if (!result.success) {
        setMessage(result.error ?? 'Upload failed');
        return;
      }
      setMessage('Receipt uploaded.');
      if (inputRef.current) inputRef.current.value = '';
      onUploaded();
    });
  };

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-black uppercase tracking-widest text-slate-500">
        Payment receipt
      </p>

      {invoice.receiptUrl ? (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          <a
            href={invoice.receiptUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-blue-600 hover:text-blue-800"
          >
            View uploaded receipt
          </a>
          {invoice.receiptFileName ? (
            <span className="text-slate-500">{invoice.receiptFileName}</span>
          ) : null}
          {invoice.receiptUploadedAt ? (
            <span className="text-xs text-slate-400">
              {new Date(invoice.receiptUploadedAt).toLocaleString()}
            </span>
          ) : null}
        </div>
      ) : (
        <p className="mt-1 text-sm text-slate-500">
          Upload bank transfer proof or payment receipt for Pearzen Forge review.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
          className="max-w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-xs file:font-bold file:uppercase file:text-white hover:file:bg-blue-500"
        />
        <button
          type="button"
          onClick={handleUpload}
          disabled={isPending}
          className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {isPending ? 'Uploading…' : invoice.receiptUrl ? 'Replace receipt' : 'Upload receipt'}
        </button>
      </div>

      {message ? <p className="mt-2 text-xs font-medium text-slate-600">{message}</p> : null}
    </div>
  );
}

export default function FmPearzenPaymentPage() {
  const [invoices, setInvoices] = useState<SaasPlatformInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const result = await fetchFmSaasInvoices();
    if (result.success) setInvoices(result.invoices);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <FmSubnav />

        <div className="mb-6">
          <h1 className="text-2xl font-black text-slate-900">Pearzen.tech payment</h1>
          <p className="text-sm text-slate-500 mt-1">
            Monthly platform invoices from Pearzen SaaS billing.
          </p>
        </div>

        {loading ? (
          <StaffPortalLoading portal="fm" message="Loading invoices…" className="min-h-[16rem]" />
        ) : invoices.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
            No Pearzen.tech invoices yet.
          </div>
        ) : (
          <div className="space-y-4">
            {invoices.map((inv) => {
              const dueToday = isInvoiceDueToday(inv.dueDate);
              const overdue = isInvoiceOverdue(inv.dueDate);
              const flash = inv.status === 'unpaid' && (dueToday || overdue);

              return (
                <div
                  key={inv.id}
                  className={`rounded-2xl border bg-white p-6 shadow-sm ${
                    flash
                      ? 'border-rose-400 ring-2 ring-rose-300 animate-pulse'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                        Due {inv.dueDate}
                      </p>
                      <p className="text-2xl font-black text-slate-900 mt-1">
                        {formatLkr(inv.totalLkr)}
                      </p>
                      {flash ? (
                        <p className="mt-2 text-sm font-bold text-rose-600">
                          {dueToday ? 'Payment due today' : 'Payment overdue'}
                        </p>
                      ) : null}
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${
                        inv.status === 'paid'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {inv.status}
                    </span>
                  </div>

                  <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                    <div>
                      <dt className="text-slate-400 text-xs uppercase font-bold">Database</dt>
                      <dd className="font-semibold text-slate-800">{formatLkr(inv.databaseCostLkr)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400 text-xs uppercase font-bold">Frontend</dt>
                      <dd className="font-semibold text-slate-800">{formatLkr(inv.frontendCostLkr)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400 text-xs uppercase font-bold">Employees</dt>
                      <dd className="font-semibold text-slate-800">
                        {inv.employeeCount} × {formatLkr(inv.perEmployeePriceLkr)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400 text-xs uppercase font-bold">Employee line</dt>
                      <dd className="font-semibold text-slate-800">{formatLkr(inv.employeeCostLkr)}</dd>
                    </div>
                  </dl>

                  <ReceiptUploadPanel invoice={inv} onUploaded={load} />

                  {inv.status === 'paid' && inv.paidAt ? (
                    <p className="mt-3 text-xs text-emerald-600 font-medium">
                      Paid {new Date(inv.paidAt).toLocaleString()}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-6 text-xs text-slate-400">
          Reference date: {today}. Due invoices flash on and after the due date each billing cycle.
        </p>
      </div>
    </div>
  );
}
