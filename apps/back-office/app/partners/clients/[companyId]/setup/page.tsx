'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';

import {
  tenantCustomDomainTypeLabel,
  tenantDomainSslStatusLabel,
  type TenantCustomDomainType,
} from '../../../../../lib/tenant-assist-setup';
import {
  deletePartnerClientDomain,
  fetchPartnerClientSetup,
  savePartnerClientPayhereCredentials,
  upsertPartnerClientDomain,
} from './actions';

export default function PartnerClientSetupPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const [companyId, setCompanyId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [domainSetupEnabled, setDomainSetupEnabled] = useState(false);
  const [payhereSetupEnabled, setPayhereSetupEnabled] = useState(false);
  const [domains, setDomains] = useState<
    Awaited<ReturnType<typeof fetchPartnerClientSetup>>['domains']
  >([]);
  const [domainTypes, setDomainTypes] = useState<TenantCustomDomainType[]>([]);
  const [payhereConfigured, setPayhereConfigured] = useState(false);
  const [payhereMerchantMasked, setPayhereMerchantMasked] = useState<string | null>(null);
  const [payhereSandbox, setPayhereSandbox] = useState(true);
  const [hostname, setHostname] = useState('');
  const [domainType, setDomainType] = useState<TenantCustomDomainType>('customer_menu');
  const [merchantId, setMerchantId] = useState('');
  const [merchantSecret, setMerchantSecret] = useState('');
  const [payhereSandboxInput, setPayhereSandboxInput] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    params.then((resolved) => setCompanyId(resolved.companyId));
  }, [params]);

  const load = async () => {
    if (!companyId) return;
    setIsLoading(true);
    const result = await fetchPartnerClientSetup(companyId);
    if (result.success) {
      setLoadError(null);
      setCompanyName(result.companyName);
      setDomainSetupEnabled(result.domainSetupEnabled);
      setPayhereSetupEnabled(result.payhereSetupEnabled);
      setDomains(result.domains);
      setDomainTypes(result.domainTypes);
      setPayhereConfigured(result.payhereStatus.configured);
      setPayhereMerchantMasked(result.payhereStatus.merchantIdMasked);
      setPayhereSandbox(result.payhereStatus.sandbox);
      setPayhereSandboxInput(result.payhereStatus.sandbox);
    } else {
      setLoadError(result.error ?? 'Failed to load setup');
    }
    setIsLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const handleSaveDomain = () => {
    startTransition(async () => {
      setActionMessage(null);
      const result = await upsertPartnerClientDomain({
        companyId,
        hostname,
        domainType,
      });
      if (!result.success) {
        setActionMessage(result.error ?? 'Failed to save domain');
        return;
      }
      setHostname('');
      setActionMessage('Domain saved. DNS and SSL verification ship in a later platform step.');
      await load();
    });
  };

  const handleDeleteDomain = (domainId: string) => {
    startTransition(async () => {
      setActionMessage(null);
      const result = await deletePartnerClientDomain({ companyId, domainId });
      if (!result.success) {
        setActionMessage(result.error ?? 'Failed to remove domain');
        return;
      }
      setActionMessage('Domain removed.');
      await load();
    });
  };

  const handleSavePayhere = () => {
    startTransition(async () => {
      setActionMessage(null);
      const result = await savePartnerClientPayhereCredentials({
        companyId,
        merchantId,
        merchantSecret,
        sandbox: payhereSandboxInput,
      });
      if (!result.success) {
        setActionMessage(result.error ?? 'Failed to save PayHere credentials');
        return;
      }
      setMerchantSecret('');
      setActionMessage('PayHere credentials saved. Secret is write-only and never shown again.');
      await load();
    });
  };

  if (isLoading) {
    return <p className="text-slate-500 animate-pulse font-mono text-sm">Loading client setup…</p>;
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          {loadError}
        </div>
        <Link
          href="/partners/portfolio"
          className="text-xs font-bold uppercase tracking-wider text-cyan-400 hover:text-white"
        >
          Back to portfolio
        </Link>
      </div>
    );
  }

  const noAssistEnabled = !domainSetupEnabled && !payhereSetupEnabled;

  return (
    <div className="space-y-6">
      <Link
        href={`/partners/portfolio/${companyId}`}
        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-cyan-300"
      >
        ← Client detail
      </Link>

      <section className="rounded-2xl border border-slate-800 bg-[#111118] p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Client setup</p>
        <h2 className="mt-2 text-2xl font-black text-white">{companyName}</h2>
        <p className="mt-2 text-sm text-slate-400">
          Assist toggles are granted by Pearzen Forge operators per linked client.
        </p>
      </section>

      {actionMessage ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          {actionMessage}
        </div>
      ) : null}

      {noAssistEnabled ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 text-sm text-amber-100/90">
          No assist modules are enabled for this client yet. Ask your Pearzen Forge operator to
          enable domain setup and/or PayHere credentials at{' '}
          <span className="font-mono text-amber-200">/forge/partners/assist</span>.
        </div>
      ) : null}

      {domainSetupEnabled ? (
        <section className="rounded-2xl border border-slate-800 bg-[#111118] p-6 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">
              Custom domains
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Register hostnames for this tenant. Routing and SSL verification are activated in a
              later platform release.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs font-bold text-slate-500 uppercase">Hostname</span>
              <input
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="menu.client.lk"
                className="w-full rounded-lg border border-slate-700 bg-[#0a0a0e] px-3 py-2 text-white font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold text-slate-500 uppercase">Type</span>
              <select
                value={domainType}
                onChange={(e) => setDomainType(e.target.value as TenantCustomDomainType)}
                className="w-full rounded-lg border border-slate-700 bg-[#0a0a0e] px-3 py-2 text-white"
              >
                {domainTypes.map((type) => (
                  <option key={type} value={type}>
                    {tenantCustomDomainTypeLabel(type)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            type="button"
            onClick={handleSaveDomain}
            disabled={isPending || !hostname.trim()}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-cyan-500 disabled:opacity-50"
          >
            Add domain
          </button>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0a0a0e] text-slate-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3">Hostname</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">SSL</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {domains.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                      No custom domains registered yet.
                    </td>
                  </tr>
                ) : (
                  domains.map((domain) => (
                    <tr key={domain.id}>
                      <td className="px-4 py-3 font-mono text-cyan-300">{domain.hostname}</td>
                      <td className="px-4 py-3 text-slate-300">
                        {tenantCustomDomainTypeLabel(domain.domainType)}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {tenantDomainSslStatusLabel(domain.sslStatus)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteDomain(domain.id)}
                          disabled={isPending}
                          className="text-xs font-bold uppercase text-rose-400 hover:text-white disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {payhereSetupEnabled ? (
        <section className="rounded-2xl border border-slate-800 bg-[#111118] p-6 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">
              PayHere credentials
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Merchant secret is encrypted at rest and never returned to the browser after save.
            </p>
          </div>

          {payhereConfigured ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-100">
              Configured · Merchant{' '}
              <span className="font-mono font-bold">{payhereMerchantMasked}</span> ·{' '}
              {payhereSandbox ? 'Sandbox' : 'Live'} mode. Enter new values below to rotate.
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1">
              <span className="text-xs font-bold text-slate-500 uppercase">Merchant ID</span>
              <input
                value={merchantId}
                onChange={(e) => setMerchantId(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-[#0a0a0e] px-3 py-2 text-white font-mono"
                autoComplete="off"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold text-slate-500 uppercase">Merchant secret</span>
              <input
                type="password"
                value={merchantSecret}
                onChange={(e) => setMerchantSecret(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-[#0a0a0e] px-3 py-2 text-white font-mono"
                autoComplete="new-password"
                placeholder={payhereConfigured ? 'Enter new secret to rotate' : ''}
              />
            </label>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={payhereSandboxInput}
              onChange={(e) => setPayhereSandboxInput(e.target.checked)}
              className="rounded border-slate-600"
            />
            Sandbox mode (uncheck for live PayHere)
          </label>

          <button
            type="button"
            onClick={handleSavePayhere}
            disabled={isPending || !merchantId.trim() || !merchantSecret.trim()}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-cyan-500 disabled:opacity-50"
          >
            Save PayHere credentials
          </button>
        </section>
      ) : null}
    </div>
  );
}
