'use client';

import { useEffect, useState, useTransition } from 'react';

import {
  SUBSCRIPTION_STATUS_LABELS,
  type CompanySubscriptionStatus,
} from '../../../lib/company-subscription';
import { formatLkr } from '../../../lib/saas-billing';
import type { ForgePlatformHealthMetrics } from '../../../lib/forge-platform-health';
import {
  captureForgePlatformHealthSnapshotAction,
  fetchForgePlatformHealthOverview,
} from './actions';
import ForgeHealthShell, {
  ForgeHealthKpiCard,
  formatHealthTimestamp,
} from './components/ForgeHealthShell';

export default function ForgeHealthPage() {
  const [metrics, setMetrics] = useState<ForgePlatformHealthMetrics | null>(null);
  const [latestSnapshotAt, setLatestSnapshotAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const load = async () => {
    setIsLoading(true);
    const result = await fetchForgePlatformHealthOverview();
    if (result.success && result.metrics) {
      setMetrics(result.metrics);
      setLatestSnapshotAt(result.latestSnapshot?.capturedAt ?? null);
      setLoadError(null);
    } else {
      setLoadError(result.error ?? 'Failed to load platform health');
      setMetrics(null);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleCapture = () => {
    startTransition(async () => {
      setActionMessage(null);
      const result = await captureForgePlatformHealthSnapshotAction();
      if (!result.success) {
        setActionMessage(result.error ?? 'Snapshot failed');
        return;
      }
      setActionMessage(`Snapshot saved at ${formatHealthTimestamp(result.capturedAt)}.`);
      await load();
    });
  };

  const statusRows: CompanySubscriptionStatus[] = ['active', 'trial', 'past_due', 'suspended'];

  return (
    <ForgeHealthShell
      title="Platform Health"
      subtitle="Cross-tenant subscriptions, MRR, overdue invoices, workforce volume, and partner performance."
      activePath="/forge/health"
      actions={
        <button
          type="button"
          onClick={handleCapture}
          disabled={isPending || isLoading || !metrics}
          className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-sky-200 disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Capture snapshot'}
        </button>
      }
    >
      {loadError ? (
        <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {loadError}
        </p>
      ) : null}
      {actionMessage ? (
        <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {actionMessage}
        </p>
      ) : null}

      {isLoading ? (
        <p className="py-12 text-center text-sm text-slate-500 animate-pulse">
          Computing platform metrics…
        </p>
      ) : metrics ? (
        <div className="space-y-8">
          <p className="text-xs text-slate-500">
            Live as of {formatHealthTimestamp(metrics.capturedAt)}
            {latestSnapshotAt
              ? ` · Last snapshot ${formatHealthTimestamp(latestSnapshotAt)}`
              : ' · No snapshots saved yet'}
          </p>

          <section className="space-y-3">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
              Tenants & revenue
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <ForgeHealthKpiCard
                label="Active / trial tenants"
                value={String(metrics.tenants.activeOrTrial)}
                hint={`${metrics.tenants.total} total · ${metrics.tenants.suspended} suspended`}
                tone="success"
              />
              <ForgeHealthKpiCard
                label="Past due"
                value={String(metrics.tenants.pastDue)}
                hint="Unpaid ERP subscription"
                tone={metrics.tenants.pastDue > 0 ? 'warning' : 'default'}
              />
              <ForgeHealthKpiCard
                label="ERP MRR"
                value={formatLkr(metrics.mrr.erpLkr)}
                hint="Database + frontend + seats"
              />
              <ForgeHealthKpiCard
                label="Total MRR"
                value={formatLkr(metrics.mrr.totalLkr)}
                hint={`Product add-ons ${formatLkr(metrics.mrr.productLkr)}`}
              />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
              Overdue invoices
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <ForgeHealthKpiCard
                label="ERP invoices overdue"
                value={String(metrics.overdue.erpInvoiceCount)}
                hint={formatLkr(metrics.overdue.erpAmountLkr)}
                tone={metrics.overdue.erpInvoiceCount > 0 ? 'danger' : 'default'}
              />
              <ForgeHealthKpiCard
                label="Product invoices overdue"
                value={String(metrics.overdue.productInvoiceCount)}
                hint={formatLkr(metrics.overdue.productAmountLkr)}
                tone={metrics.overdue.productInvoiceCount > 0 ? 'warning' : 'default'}
              />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
              Workforce & café volume
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <ForgeHealthKpiCard
                label="Employee headcount"
                value={String(metrics.workforce.employeeHeadcount)}
                hint="Active MNR employees"
              />
              <ForgeHealthKpiCard
                label="Check-ins (7d)"
                value={String(metrics.workforce.checkIns7d)}
              />
              <ForgeHealthKpiCard
                label="Check-ins (30d)"
                value={String(metrics.workforce.checkIns30d)}
              />
              <ForgeHealthKpiCard
                label="Café orders (7d)"
                value={String(metrics.workforce.cafeOrders7d)}
                hint="Café-enabled tenants"
              />
              <ForgeHealthKpiCard
                label="Café orders (30d)"
                value={String(metrics.workforce.cafeOrders30d)}
              />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
              Partners
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <ForgeHealthKpiCard
                label="Active partners"
                value={String(metrics.partners.activePartnerCount)}
              />
              <ForgeHealthKpiCard
                label="Closed-client links"
                value={String(metrics.partners.closedClientLinks)}
                hint="Active portfolio rows"
              />
              <ForgeHealthKpiCard
                label="Partner share (ledger)"
                value={formatLkr(metrics.partners.payoutPartnerShareLkr)}
              />
              <ForgeHealthKpiCard
                label="Pearzen share (ledger)"
                value={formatLkr(metrics.partners.payoutPearzenShareLkr)}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-[#111118] p-5">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
              Subscription mix
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {statusRows.map((status) => (
                <div key={status} className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {SUBSCRIPTION_STATUS_LABELS[status]}
                  </p>
                  <p className="mt-1 text-xl font-black text-white">
                    {metrics.tenants.byStatus[status]}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </ForgeHealthShell>
  );
}
