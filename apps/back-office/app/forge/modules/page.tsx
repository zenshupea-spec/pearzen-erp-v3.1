'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';

import {
  TENANT_VERTICAL_DEFINITIONS,
  verticalIsEnabled,
  verticalStatusBadgeClass,
  verticalStatusLabel,
  type TenantVerticalKey,
} from '../../../lib/tenant-verticals';
import {
  fetchModuleTenants,
  setTenantVerticalStatus,
  type ForgeModuleTenant,
} from './actions';

function VerticalToggle({
  enabled,
  disabled,
  onToggle,
}: {
  enabled: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors disabled:opacity-50 ${
        enabled ? 'bg-emerald-500' : 'bg-slate-700'
      }`}
      aria-pressed={enabled}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
          enabled ? 'translate-x-8' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export default function ModuleProvisioningPage() {
  const [tenants, setTenants] = useState<ForgeModuleTenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadData = async () => {
    setIsLoading(true);
    const result = await fetchModuleTenants();
    if (result.success) {
      setLoadError(null);
      setTenants(result.tenants);
    } else {
      setLoadError(result.error ?? 'Failed to load tenant modules');
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleVertical = (companyId: string, vertical: TenantVerticalKey, enabled: boolean) => {
    startTransition(async () => {
      setActionMessage(null);
      const result = await setTenantVerticalStatus({
        companyId,
        vertical,
        enabled: !enabled,
      });

      if (!result.success) {
        setActionMessage(result.error ?? 'Failed to update module');
        return;
      }

      setActionMessage('Module flags updated.');
      await loadData();
    });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0e] text-slate-200 font-sans pb-20">
      <div className="bg-[#111118] border-b border-emerald-500/20 sticky top-0 z-50 px-6 py-4 flex items-center gap-4 shadow-lg">
        <Link
          href="/forge/tenants"
          className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-black text-white tracking-tight uppercase">Module Provisioning</h1>
          <p className="text-[10px] text-emerald-400 font-mono font-bold uppercase tracking-widest mt-0.5">
            Vertical subscriptions · synced with tenant flags
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

        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-sm text-emerald-100">
          Restaurant / café toggles sync with <code className="text-emerald-200">has_cafe_module</code> and{' '}
          <code className="text-emerald-200">tenant_vertical_subscriptions</code>. Salon unlocks{' '}
          <code className="text-emerald-200">/salon</code>; retail unlocks{' '}
          <code className="text-emerald-200">/retail</code>.
        </div>

        <div className="bg-[#111118] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0a0a0e] text-slate-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Tenant</th>
                  {TENANT_VERTICAL_DEFINITIONS.map((vertical) => (
                    <th key={vertical.key} className="px-6 py-4 min-w-[160px]">
                      <div>{vertical.shortLabel}</div>
                      <div className="mt-1 text-[10px] font-normal normal-case text-slate-600">
                        {vertical.routeHint}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={1 + TENANT_VERTICAL_DEFINITIONS.length}
                      className="px-6 py-12 text-center text-slate-500 font-mono animate-pulse"
                    >
                      Loading tenant modules…
                    </td>
                  </tr>
                ) : tenants.length === 0 ? (
                  <tr>
                    <td
                      colSpan={1 + TENANT_VERTICAL_DEFINITIONS.length}
                      className="px-6 py-12 text-center text-slate-500 font-medium"
                    >
                      No tenants found.
                    </td>
                  </tr>
                ) : (
                  tenants.map((tenant) => (
                    <tr key={tenant.id} className="hover:bg-slate-800/30 transition-colors align-top">
                      <td className="px-6 py-4">
                        <p className="font-bold text-white">{tenant.name}</p>
                        {tenant.slug ? (
                          <p className="text-[10px] font-mono text-slate-500 mt-0.5">{tenant.slug}</p>
                        ) : null}
                      </td>
                      {TENANT_VERTICAL_DEFINITIONS.map((vertical) => {
                        const status = tenant.verticals[vertical.key];
                        const enabled = verticalIsEnabled(status);

                        return (
                          <td key={vertical.key} className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <VerticalToggle
                                enabled={enabled}
                                disabled={isPending}
                                onToggle={() =>
                                  handleToggleVertical(tenant.id, vertical.key, enabled)
                                }
                              />
                              <span
                                className={`text-xs font-bold tracking-wider uppercase ${verticalStatusBadgeClass(status)}`}
                              >
                                {verticalStatusLabel(status)}
                              </span>
                            </div>
                          </td>
                        );
                      })}
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
