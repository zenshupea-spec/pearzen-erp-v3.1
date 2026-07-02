'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  SUBSCRIPTION_STATUS_DESCRIPTIONS,
  SUBSCRIPTION_STATUS_LABELS,
  subscriptionStatusBadgeClass,
  type CompanySubscriptionStatus,
} from '../../../lib/company-subscription';
import {
  FORGE_EXECUTIVE_2FA_CLEAR_COPY,
  type ForgeExecutive2faTarget,
  type ForgeTenantExecutiveSlot,
} from '../../../lib/forge-tenant-executive-portal';
import { tenantProductionDomain } from '../../../lib/tenant-host';
import {
  fetchForgeTenants,
  forgeAdminClearTenantExecutive2faAction,
  syncForgeTenantBillingStatus,
  updateForgeTenantProductBundle,
  updateForgeTenantSubscriptionStatus,
  type ForgeTenantRow,
} from './actions';
import StaffPortalLoading from '../../../components/portal/StaffPortalLoading';
import type { ProductBundle } from '../../../lib/tenant-product-bundle';

type Clear2faModalState = {
  companyId: string;
  companyName: string;
  target: ForgeExecutive2faTarget;
  slot: ForgeTenantExecutiveSlot;
} | null;

function Executive2faSlot({
  label,
  slot,
  companyId,
  companyName,
  target,
  disabled,
  onRequestClear,
}: {
  label: string;
  slot: ForgeTenantExecutiveSlot;
  companyId: string;
  companyName: string;
  target: ForgeExecutive2faTarget;
  disabled: boolean;
  onRequestClear: (state: Clear2faModalState) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      {slot.email ? (
        <p className="text-xs text-slate-300 break-all">{slot.email}</p>
      ) : (
        <p className="text-xs text-slate-600">No executive on file</p>
      )}
      <p className="text-[10px] text-slate-500">
        2FA:{' '}
        <span className={slot.twoFactorEnabled ? 'text-emerald-400' : 'text-slate-500'}>
          {slot.twoFactorEnabled ? 'enabled' : 'off'}
        </span>
      </p>
      {slot.employeeId && slot.twoFactorEnabled ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            onRequestClear({
              companyId,
              companyName,
              target,
              slot,
            })
          }
          className="text-[10px] font-bold uppercase tracking-wider text-rose-400 hover:text-white disabled:opacity-50"
        >
          Remove 2FA
        </button>
      ) : null}
    </div>
  );
}

export default function ForgeTenantsPage() {
  const searchParams = useSearchParams();
  const onboardedCompanyId = searchParams.get('onboarded');

  const [tenants, setTenants] = useState<ForgeTenantRow[]>([]);
  const [statusOptions, setStatusOptions] = useState<CompanySubscriptionStatus[]>([]);
  const [bundleOptions, setBundleOptions] = useState<ProductBundle[]>([]);
  const [bundleLabels, setBundleLabels] = useState<Record<ProductBundle, string>>({
    full_erp: 'Full ERP',
    wfm_only: 'WFM only',
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [clearModal, setClearModal] = useState<Clear2faModalState>(null);
  const [totpCode, setTotpCode] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    const result = await fetchForgeTenants();
    if (result.success) {
      setLoadError(null);
      setTenants(result.tenants);
      setStatusOptions(result.statusOptions);
      setBundleOptions(result.bundleOptions);
      setBundleLabels(result.bundleLabels);
    } else {
      setLoadError(result.error ?? 'Failed to load tenants');
    }
    setIsLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleStatusChange = (companyId: string, status: CompanySubscriptionStatus) => {
    startTransition(async () => {
      setActionMessage(null);
      const result = await updateForgeTenantSubscriptionStatus(companyId, status);
      if (!result.success) {
        setActionMessage(result.error ?? 'Failed to update status');
        return;
      }
      setActionMessage('Subscription status updated.');
      await load();
    });
  };

  const handleBundleChange = (companyId: string, bundle: ProductBundle) => {
    startTransition(async () => {
      setActionMessage(null);
      const result = await updateForgeTenantProductBundle(companyId, bundle);
      if (!result.success) {
        setActionMessage(result.error ?? 'Failed to update product bundle');
        return;
      }
      setActionMessage('Product bundle updated.');
      await load();
    });
  };

  const handleSyncBilling = (companyId: string) => {
    startTransition(async () => {
      setActionMessage(null);
      const result = await syncForgeTenantBillingStatus(companyId);
      if (!result.success) {
        setActionMessage(result.error ?? 'Failed to sync from billing');
        return;
      }
      setActionMessage(
        result.subscriptionStatus
          ? `Billing sync complete — status is ${SUBSCRIPTION_STATUS_LABELS[result.subscriptionStatus]}.`
          : 'Billing sync complete.',
      );
      await load();
    });
  };

  const closeClearModal = () => {
    setClearModal(null);
    setTotpCode('');
    setModalError(null);
  };

  const handleConfirmClear2fa = () => {
    if (!clearModal) return;

    startTransition(async () => {
      setModalError(null);
      const result = await forgeAdminClearTenantExecutive2faAction(
        clearModal.companyId,
        clearModal.target,
        totpCode,
      );
      if (!result.success) {
        setModalError(result.error ?? 'Failed to clear 2FA');
        return;
      }

      closeClearModal();
      setActionMessage(
        `${clearModal.target.toUpperCase()} 2FA cleared for ${clearModal.companyName}. The executive must set up 2FA on their next MD Portal login.`,
      );
      await load();
    });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0e] text-slate-200 font-sans pb-20">
      <div className="bg-[#111118] border-b border-violet-500/20 sticky top-0 z-50 px-6 py-4 flex items-center gap-4 shadow-lg">
        <Link
          href="/forge"
          className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-black text-white tracking-tight uppercase">Tenant Roster</h1>
          <p className="text-[10px] text-violet-400 font-mono font-bold uppercase tracking-widest mt-0.5">
            Subscription status · MD/OD 2FA recovery
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {loadError ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
            {loadError}
          </div>
        ) : null}
        {actionMessage ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            {actionMessage}
          </div>
        ) : null}
        {onboardedCompanyId ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            New tenant onboarded. Set ERP pricing in{' '}
            <Link
              href={`/forge/billing?company=${onboardedCompanyId}`}
              className="font-bold text-emerald-100 underline hover:text-white"
            >
              Platform Billing
            </Link>
            .
          </div>
        ) : null}

        <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4 text-sm text-violet-100 space-y-2">
          <p>
            <strong>Suspended</strong> sets <code className="text-violet-200">is_active=false</code> and{' '}
            <code className="text-violet-200">is_suspended=true</code>.{' '}
            <strong>Past due</strong> is set automatically when a platform invoice is due or overdue — portals stay online until you suspend manually.
          </p>
          <p className="text-violet-200/90">{FORGE_EXECUTIVE_2FA_CLEAR_COPY}</p>
        </div>

        <div className="bg-[#111118] border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">All tenants</h2>
            <Link
              href="/forge/companies/new"
              className="text-xs font-bold uppercase tracking-wider text-violet-400 hover:text-white"
            >
              Onboard tenant
            </Link>
          </div>

          <div className="overflow-x-auto">
            {isLoading ? (
              <StaffPortalLoading portal="forge" message="Loading tenants…" className="min-h-[16rem] py-12" />
            ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0a0a0e] text-slate-500 text-xs uppercase">
                <tr>
                  <th className="px-6 py-3">Company</th>
                  <th className="px-6 py-3">Domain</th>
                  <th className="px-6 py-3">MD / OD</th>
                  <th className="px-6 py-3">Subscription</th>
                  <th className="px-6 py-3">Bundle</th>
                  <th className="px-6 py-3">Kill switch</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {tenants.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                      No tenants found.
                    </td>
                  </tr>
                ) : (
                  tenants.map((tenant) => (
                    <tr key={tenant.id}>
                      <td className="px-6 py-4">
                        <p className="font-bold text-white">{tenant.name}</p>
                        {tenant.slug ? (
                          <p className="text-[10px] font-mono text-slate-500 mt-0.5">{tenant.slug}</p>
                        ) : null}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-400">
                        {tenant.slug ? tenantProductionDomain(tenant.slug) : '—'}
                      </td>
                      <td className="px-6 py-4 align-top">
                        <div className="grid gap-4 sm:grid-cols-2 min-w-[220px]">
                          <Executive2faSlot
                            label="MD"
                            slot={tenant.executives.md}
                            companyId={tenant.id}
                            companyName={tenant.name}
                            target="md"
                            disabled={isPending}
                            onRequestClear={setClearModal}
                          />
                          <Executive2faSlot
                            label="OD"
                            slot={tenant.executives.od}
                            companyId={tenant.id}
                            companyName={tenant.name}
                            target="od"
                            disabled={isPending}
                            onRequestClear={setClearModal}
                          />
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <select
                          value={tenant.subscriptionStatus}
                          onChange={(e) =>
                            handleStatusChange(tenant.id, e.target.value as CompanySubscriptionStatus)
                          }
                          disabled={isPending}
                          title={SUBSCRIPTION_STATUS_DESCRIPTIONS[tenant.subscriptionStatus]}
                          className={`rounded-lg border px-2 py-1 text-[11px] font-bold uppercase tracking-wide bg-[#0a0a0e] disabled:opacity-50 ${subscriptionStatusBadgeClass(tenant.subscriptionStatus)}`}
                        >
                          {statusOptions.map((status) => (
                            <option key={status} value={status} className="bg-[#111118] text-white">
                              {SUBSCRIPTION_STATUS_LABELS[status]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-4">
                        <select
                          value={tenant.productBundle}
                          onChange={(e) =>
                            handleBundleChange(tenant.id, e.target.value as ProductBundle)
                          }
                          disabled={isPending}
                          className="rounded-lg border border-slate-700 px-2 py-1 text-[11px] font-bold uppercase tracking-wide bg-[#0a0a0e] text-slate-200 disabled:opacity-50"
                        >
                          {bundleOptions.map((bundle) => (
                            <option key={bundle} value={bundle} className="bg-[#111118] text-white">
                              {bundleLabels[bundle]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-400">
                        <span className={tenant.isActive ? 'text-emerald-400' : 'text-rose-400'}>
                          active={String(tenant.isActive)}
                        </span>
                        {' · '}
                        <span className={tenant.isSuspended ? 'text-rose-400' : 'text-slate-500'}>
                          suspended={String(tenant.isSuspended)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right space-x-3 whitespace-nowrap">
                        <Link
                          href={`/forge/tenants/${tenant.id}/websites`}
                          className="text-xs font-bold text-cyan-400 hover:text-white uppercase"
                        >
                          Websites
                        </Link>
                        <Link
                          href={`/forge/tenants/${tenant.id}/domains`}
                          className="text-xs font-bold text-violet-400 hover:text-white uppercase"
                        >
                          Domains
                        </Link>
                        <Link
                          href={`/forge/billing?company=${tenant.id}`}
                          className="text-xs font-bold text-rose-400 hover:text-white uppercase"
                        >
                          Billing
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleSyncBilling(tenant.id)}
                          disabled={isPending}
                          className="text-xs font-bold text-indigo-400 hover:text-white uppercase disabled:opacity-50"
                        >
                          Sync billing
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            )}
          </div>
        </div>
      </div>

      {clearModal ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="forge-clear-2fa-title"
            className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-[#111118] p-6 shadow-2xl"
          >
            <h2 id="forge-clear-2fa-title" className="text-lg font-bold text-white">
              Remove {clearModal.target.toUpperCase()} 2FA
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Tenant: <span className="text-white">{clearModal.companyName}</span>
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Executive:{' '}
              <span className="text-white break-all">
                {clearModal.slot.fullName ?? clearModal.target.toUpperCase()} ({clearModal.slot.email})
              </span>
            </p>
            <p className="mt-4 text-sm text-rose-200/90">{FORGE_EXECUTIVE_2FA_CLEAR_COPY}</p>

            <label className="mt-5 block text-xs font-bold uppercase tracking-wider text-slate-500">
              Your Forge authenticator code
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-[#0a0a0e] px-3 py-2 text-white tracking-[0.3em] text-center"
                placeholder="000000"
              />
            </label>

            {modalError ? (
              <p className="mt-3 text-sm text-rose-300">{modalError}</p>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeClearModal}
                disabled={isPending}
                className="rounded-lg px-4 py-2 text-sm font-bold text-slate-400 hover:text-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClear2fa}
                disabled={isPending || totpCode.length !== 6}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-500 disabled:opacity-50"
              >
                {isPending ? 'Clearing…' : 'Clear 2FA'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
