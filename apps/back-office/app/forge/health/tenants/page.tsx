'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  SUBSCRIPTION_STATUS_LABELS,
  subscriptionStatusBadgeClass,
} from '../../../../lib/company-subscription';
import { PRODUCT_BUNDLE_LABELS } from '../../../../lib/tenant-product-bundle';
import { formatLkr } from '../../../../lib/saas-billing';
import { tenantProductionDomain } from '../../../../lib/tenant-host';
import type { ForgeTenantHealthRow } from '../../../../lib/forge-platform-health';
import { fetchForgeTenantHealthDashboard } from '../actions';
import ForgeHealthShell from '../components/ForgeHealthShell';

export default function ForgeTenantHealthPage() {
  const [tenants, setTenants] = useState<ForgeTenantHealthRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      const result = await fetchForgeTenantHealthDashboard();
      if (result.success) {
        setTenants(result.tenants);
        setLoadError(null);
      } else {
        setLoadError(result.error ?? 'Failed to load tenant health');
      }
      setIsLoading(false);
    })();
  }, []);

  return (
    <ForgeHealthShell
      title="Tenant Health"
      subtitle="Per-tenant headcount, ERP MRR, check-in volume, café orders, and overdue ERP invoices."
      activePath="/forge/health/tenants"
    >
      {loadError ? (
        <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {loadError}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#111118] shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-slate-800 bg-[#0a0a0e] text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Tenant</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Bundle</th>
                <th className="px-4 py-3">Employees</th>
                <th className="px-4 py-3">ERP MRR</th>
                <th className="px-4 py-3">Check-ins 7d</th>
                <th className="px-4 py-3">Check-ins 30d</th>
                <th className="px-4 py-3">Café 7d</th>
                <th className="px-4 py-3">Overdue ERP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-500 animate-pulse">
                    Loading tenant metrics…
                  </td>
                </tr>
              ) : tenants.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                    No tenants found.
                  </td>
                </tr>
              ) : (
                tenants.map((tenant) => (
                  <tr key={tenant.companyId} className="hover:bg-slate-900/40">
                    <td className="px-4 py-3">
                      <p className="font-bold text-white">{tenant.name}</p>
                      <p className="text-xs text-slate-500">
                        {tenant.slug ? tenantProductionDomain(tenant.slug) : tenant.companyId.slice(0, 8)}
                      </p>
                      <Link
                        href={`/forge/tenants?onboarded=${tenant.companyId}`}
                        className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 hover:text-white"
                      >
                        Roster →
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${subscriptionStatusBadgeClass(tenant.subscriptionStatus)}`}
                      >
                        {SUBSCRIPTION_STATUS_LABELS[tenant.subscriptionStatus]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-300">
                      {PRODUCT_BUNDLE_LABELS[tenant.productBundle]}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-200">{tenant.employeeCount}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-200">
                      {formatLkr(tenant.erpMrrLkr)}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-200">{tenant.checkIns7d}</td>
                    <td className="px-4 py-3 font-mono text-slate-200">{tenant.checkIns30d}</td>
                    <td className="px-4 py-3 font-mono text-slate-200">
                      {tenant.hasCafeModule ? tenant.cafeOrders7d : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {tenant.overdueErpLkr > 0 ? (
                        <span className="text-rose-300">{formatLkr(tenant.overdueErpLkr)}</span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ForgeHealthShell>
  );
}
