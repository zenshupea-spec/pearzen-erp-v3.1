'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition, type FormEvent } from 'react';

import { formatLkr } from '../../../../lib/saas-billing';
import type { WebsitePartnerClientRow } from '../../clients/actions';
import { FORGE_PORTAL_THEME as T } from '../../components/forge-portal-theme';
import {
  fetchForgePartnerDetail,
  payoutSourceTypeLabel,
  recordForgePartnerDisbursement,
  type ForgePartnerDetailPayload,
  type ForgePartnerDisbursementRow,
  type ForgePartnerPaymentRow,
} from '../actions';

const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
] as const;

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatBillingMonth(value: string): string {
  if (!value) return '—';
  return value.slice(0, 7);
}

function formatRecordedAt(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString('en-LK', { year: 'numeric', month: 'short', day: 'numeric' });
}

function siteStatusBadge(siteLive: boolean): string {
  return siteLive
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-amber-200 bg-amber-50 text-amber-700';
}

function monthlyStatusBadge(status: WebsitePartnerClientRow['monthlyStatus']): string {
  switch (status) {
    case 'current':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'past_due':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'setup':
      return 'border-sky-200 bg-sky-50 text-sky-700';
    case 'churned':
      return 'border-slate-200 bg-slate-100 text-slate-500';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600';
  }
}

function monthlyStatusLabel(status: WebsitePartnerClientRow['monthlyStatus']): string {
  switch (status) {
    case 'current':
      return 'Current';
    case 'past_due':
      return 'Past due';
    case 'setup':
      return 'Setup';
    case 'churned':
      return 'Churned';
    default:
      return 'Unknown';
  }
}

function SummaryCard({
  label,
  value,
  accent = 'text-slate-900',
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className={`${T.card} p-4`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className={`mt-1.5 text-xl font-bold ${accent}`}>{value}</p>
    </div>
  );
}

function ClientsSection({ clients }: { clients: WebsitePartnerClientRow[] }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return clients;
    return clients.filter((row) => {
      const haystack = [row.companyName, row.companySlug, row.siteHostname]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [clients, query]);

  return (
    <div className={`${T.card} overflow-hidden`}>
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Website clients</h2>
          <p className="mt-0.5 text-xs text-slate-500">{clients.length} linked portfolio client(s)</p>
        </div>
        <label className="relative block w-full sm:w-64">
          <span className="sr-only">Search clients</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search client or hostname…"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 pl-9 text-sm outline-none focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-100"
          />
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className={T.tableHead}>
            <tr>
              <th className="px-4 py-3 sm:px-6">Client</th>
              <th className="px-4 py-3 sm:px-6">Site</th>
              <th className="px-4 py-3 sm:px-6">Billing</th>
              <th className="px-4 py-3 sm:px-6">Closed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center text-slate-400">
                  {query ? 'No clients match your search.' : 'No website clients yet.'}
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id} className={T.tableRow}>
                  <td className="px-4 py-4 sm:px-6">
                    <p className="font-semibold text-slate-900">{row.companyName}</p>
                    {row.companySlug ? (
                      <p className="mt-0.5 font-mono text-xs text-slate-500">{row.companySlug}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 sm:px-6">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${siteStatusBadge(row.siteLive)}`}
                    >
                      {row.siteLive ? 'Live' : 'Not live'}
                    </span>
                    {row.siteHostname ? (
                      <p className="mt-1 font-mono text-[11px] text-emerald-700">{row.siteHostname}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 sm:px-6">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${monthlyStatusBadge(row.monthlyStatus)}`}
                    >
                      {monthlyStatusLabel(row.monthlyStatus)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-slate-500 sm:px-6">{row.closedAt || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PaymentsSection({ payments }: { payments: ForgePartnerPaymentRow[] }) {
  const totals = payments.reduce(
    (acc, row) => ({
      partner: acc.partner + row.partnerShareLkr,
      pearzen: acc.pearzen + row.pearzenShareLkr,
    }),
    { partner: 0, pearzen: 0 },
  );

  return (
    <div className={`${T.card} overflow-hidden`}>
      <div className="border-b border-slate-200 px-4 py-4 sm:px-6">
        <h2 className="text-sm font-bold text-slate-900">Revenue share accruals</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Ledger entries when client invoices are marked paid · {payments.length} record
          {payments.length === 1 ? '' : 's'}
        </p>
        {payments.length > 0 ? (
          <p className="mt-2 text-xs text-slate-600">
            Shown totals — Manager {formatLkr(totals.partner)} · Pearzen {formatLkr(totals.pearzen)}
          </p>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className={T.tableHead}>
            <tr>
              <th className="px-4 py-3 sm:px-6">Month</th>
              <th className="px-4 py-3 sm:px-6">Client</th>
              <th className="px-4 py-3 sm:px-6">Source</th>
              <th className="px-4 py-3 text-right sm:px-6">Manager</th>
              <th className="px-4 py-3 text-right sm:px-6">Pearzen</th>
              <th className="px-4 py-3 sm:px-6">Recorded</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payments.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-slate-400">
                  No payout ledger entries yet for this manager.
                </td>
              </tr>
            ) : (
              payments.map((row) => (
                <tr key={row.id} className={T.tableRow}>
                  <td className="px-4 py-4 font-mono text-slate-700 sm:px-6">
                    {formatBillingMonth(row.billingMonth)}
                  </td>
                  <td className="px-4 py-4 text-slate-800 sm:px-6">{row.companyName ?? '—'}</td>
                  <td className="px-4 py-4 sm:px-6">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      {payoutSourceTypeLabel(row.sourceType)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right font-semibold text-cyan-700 sm:px-6">
                    {formatLkr(row.partnerShareLkr)}
                  </td>
                  <td className="px-4 py-4 text-right text-violet-700 sm:px-6">
                    {formatLkr(row.pearzenShareLkr)}
                  </td>
                  <td className="px-4 py-4 text-slate-500 sm:px-6">{formatRecordedAt(row.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function paymentMethodLabel(value: string | null): string {
  if (!value) return '—';
  const match = PAYMENT_METHODS.find((row) => row.value === value);
  return match?.label ?? value.replace(/_/g, ' ');
}

function DisbursementsSection({ disbursements }: { disbursements: ForgePartnerDisbursementRow[] }) {
  return (
    <div className={`${T.card} overflow-hidden`}>
      <div className="border-b border-slate-200 px-4 py-4 sm:px-6">
        <h2 className="text-sm font-bold text-slate-900">Disbursements to manager</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Actual bank/cash payments Pearzen made to this partner
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className={T.tableHead}>
            <tr>
              <th className="px-4 py-3 sm:px-6">Paid on</th>
              <th className="px-4 py-3 text-right sm:px-6">Amount</th>
              <th className="px-4 py-3 sm:px-6">Method</th>
              <th className="px-4 py-3 sm:px-6">Reference</th>
              <th className="px-4 py-3 sm:px-6">Recorded</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {disbursements.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-slate-400">
                  No disbursements recorded yet.
                </td>
              </tr>
            ) : (
              disbursements.map((row) => (
                <tr key={row.id} className={T.tableRow}>
                  <td className="px-4 py-4 font-mono text-slate-700 sm:px-6">{row.paidOn || '—'}</td>
                  <td className="px-4 py-4 text-right font-semibold text-cyan-700 sm:px-6">
                    {formatLkr(row.amountLkr)}
                  </td>
                  <td className="px-4 py-4 text-slate-600 sm:px-6">
                    {paymentMethodLabel(row.paymentMethod)}
                  </td>
                  <td className="px-4 py-4 text-slate-600 sm:px-6">
                    {row.reference || row.notes || '—'}
                  </td>
                  <td className="px-4 py-4 text-slate-500 sm:px-6">
                    {formatRecordedAt(row.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RecordPaymentForm({
  partnerId,
  balanceOwedLkr,
  onRecorded,
}: {
  partnerId: string;
  balanceOwedLkr: number;
  onRecorded: () => void;
}) {
  const [amountLkr, setAmountLkr] = useState(
    balanceOwedLkr > 0 ? String(Math.round(balanceOwedLkr)) : '',
  );
  const [paidOn, setPaidOn] = useState(todayIsoDate());
  const [paymentMethod, setPaymentMethod] = useState<string>('bank_transfer');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionTone, setActionTone] = useState<'success' | 'error'>('success');
  const [isPending, startTransition] = useTransition();

  const fieldClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900';
  const labelClass = 'text-xs font-bold uppercase tracking-wider text-slate-500';

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      setActionMessage(null);
      const result = await recordForgePartnerDisbursement({
        partnerId,
        amountLkr: Number(amountLkr),
        paidOn,
        paymentMethod,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
      });

      if (!result.success) {
        setActionTone('error');
        setActionMessage(result.error ?? 'Failed to record payment');
        return;
      }

      setActionTone('success');
      setActionMessage('Payment recorded.');
      setReference('');
      setNotes('');
      onRecorded();
    });
  };

  return (
    <form onSubmit={handleSubmit} className={`${T.card} space-y-4 p-6`}>
      <div>
        <h2 className="text-sm font-bold text-slate-900">Record payment to manager</h2>
        <p className="mt-1 text-xs text-slate-500">
          Log a bank transfer or cash payment. Outstanding accrual balance:{' '}
          <strong className="text-cyan-700">{formatLkr(balanceOwedLkr)}</strong>
        </p>
      </div>

      {actionMessage ? (
        <div
          className={`rounded-xl border p-3 text-sm ${
            actionTone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {actionMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="space-y-1">
          <span className={labelClass}>Amount (LKR)</span>
          <input
            type="number"
            min="1"
            step="1"
            required
            value={amountLkr}
            onChange={(e) => setAmountLkr(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="space-y-1">
          <span className={labelClass}>Paid on</span>
          <input
            type="date"
            required
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="space-y-1">
          <span className={labelClass}>Method</span>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className={fieldClass}
          >
            {PAYMENT_METHODS.map((row) => (
              <option key={row.value} value={row.value}>
                {row.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className={labelClass}>Reference</span>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Bank ref / receipt no."
            className={fieldClass}
          />
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className={labelClass}>Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={fieldClass}
            placeholder="Optional internal note"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="rounded-full border border-cyan-300 bg-cyan-600 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm hover:bg-cyan-700 disabled:opacity-50"
      >
        Record payment
      </button>
    </form>
  );
}

export default function ForgePartnerDetailPage() {
  const params = useParams();
  const partnerId = typeof params.partnerId === 'string' ? params.partnerId : '';

  const [detail, setDetail] = useState<ForgePartnerDetailPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!partnerId) {
        setLoadError('Missing partner id');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      const result = await fetchForgePartnerDetail(partnerId);
      if (cancelled) return;

      if (result.success && result.detail) {
        setDetail(result.detail);
        setLoadError(null);
      } else {
        setDetail(null);
        setLoadError(result.error ?? 'Partner not found');
      }
      setIsLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [partnerId, reloadNonce]);

  if (isLoading) {
    return <p className="text-sm text-slate-500 animate-pulse">Loading partner detail…</p>;
  }

  if (loadError || !detail) {
    return (
      <div className="space-y-4">
        <Link
          href="/forge/partners"
          className="text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-violet-700"
        >
          ← Partner hub
        </Link>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {loadError ?? 'Partner not found'}
        </div>
      </div>
    );
  }

  const { partner, clients, payments, disbursements, totalDisbursedLkr, balanceOwedLkr } = detail;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/forge/partners"
          className="text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-violet-700"
        >
          ← Partner hub
        </Link>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{partner.displayName}</h1>
            <p className={`mt-1 ${T.sectionDesc}`}>
              {partner.email} · referral{' '}
              <span className="font-mono text-xs">{partner.referralCode}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
                partner.isActive
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-slate-100 text-slate-500'
              }`}
            >
              {partner.isActive ? 'Active' : 'Inactive'}
            </span>
            <Link
              href="/forge/clients?segment=websites"
              className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-800 hover:bg-emerald-100"
            >
              Open client hub
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <SummaryCard
          label="Website clients"
          value={String(partner.websiteClientCount)}
          accent="text-emerald-700"
        />
        <SummaryCard
          label="Accrued share"
          value={
            partner.totalPaidToPartnerLkr > 0 ? formatLkr(partner.totalPaidToPartnerLkr) : '—'
          }
          accent="text-cyan-700"
        />
        <SummaryCard
          label="Disbursed"
          value={totalDisbursedLkr > 0 ? formatLkr(totalDisbursedLkr) : '—'}
        />
        <SummaryCard
          label="Outstanding"
          value={formatLkr(balanceOwedLkr)}
          accent={balanceOwedLkr > 0 ? 'text-amber-700' : 'text-emerald-700'}
        />
        <SummaryCard
          label="Pearzen share"
          value={partner.totalPearzenShareLkr > 0 ? formatLkr(partner.totalPearzenShareLkr) : '—'}
          accent="text-violet-700"
        />
      </div>

      <RecordPaymentForm
        partnerId={partner.id}
        balanceOwedLkr={balanceOwedLkr}
        onRecorded={() => setReloadNonce((value) => value + 1)}
      />

      <DisbursementsSection disbursements={disbursements} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ClientsSection clients={clients} />
        <PaymentsSection payments={payments} />
      </div>
    </div>
  );
}
