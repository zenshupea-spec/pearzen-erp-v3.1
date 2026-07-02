'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, useTransition } from 'react';

import type { ForgePayoutRules } from '../../../../lib/forge-partners';
import type { ForgeCustomPricingDefaults } from '../../../../lib/forge-pricing';
import { formatLkr } from '../../../../lib/saas-billing';
import { FORGE_PORTAL_THEME as T } from '../../components/forge-portal-theme';
import {
  fetchForgePricingDashboard,
  updateForgeCustomClientPricing,
  updateForgeCustomDefaultPricing,
  updateForgeWfmDefaultPricing,
  updateForgeWfmSubscriberPricing,
  updateForgeWebsitePricingRules,
  type ForgeCustomPricingRow,
  type ForgePricingDashboard,
  type ForgeWfmPricingRow,
} from '../pricing-actions';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100';
const labelClass = 'text-[10px] font-bold uppercase tracking-widest text-slate-500';
const btnPrimary =
  'rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50';

function num(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function StatusBanner({ message, isError }: { message: string; isError?: boolean }) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 text-sm ${
        isError
          ? 'border-rose-200 bg-rose-50 text-rose-800'
          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
      }`}
    >
      {message}
    </div>
  );
}

function WebsiteRulesSection({
  rules,
  onSaved,
}: {
  rules: ForgePayoutRules;
  onSaved: (message: string) => void;
}) {
  const [draft, setDraft] = useState(rules);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setDraft(rules);
  }, [rules]);

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateForgeWebsitePricingRules(draft);
      if (!result.success) {
        setError(result.error ?? 'Save failed');
        return;
      }
      onSaved('Website pricing rules saved.');
    });
  };

  const fields: { key: keyof ForgePayoutRules; label: string; group: string }[] = [
    { key: 'monthOneClientLkr', label: 'Client pays', group: 'Month 1' },
    { key: 'monthOnePearzenLkr', label: 'Pearzen keeps', group: 'Month 1' },
    { key: 'monthOnePartnerLkr', label: 'Manager earns', group: 'Month 1' },
    { key: 'monthTwoPlusClientLkr', label: 'Client pays / mo', group: 'Month 2+' },
    { key: 'monthTwoPlusPearzenLkr', label: 'Pearzen keeps / mo', group: 'Month 2+' },
    { key: 'monthTwoPlusPartnerLkr', label: 'Manager earns / mo', group: 'Month 2+' },
  ];

  return (
    <section className={`${T.card} p-5 sm:p-6 space-y-5`}>
      <div>
        <h2 className="text-base font-bold text-slate-900">Website clients</h2>
        <p className="mt-1 text-sm text-slate-500">
          Client invoice amounts and Pearzen / web-manager splits. Ledger accruals post when website
          invoices are marked paid.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {(['Month 1', 'Month 2+'] as const).map((group) => (
          <div key={group} className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-cyan-700">{group}</p>
            {fields
              .filter((field) => field.group === group)
              .map((field) => (
                <label key={field.key} className="block space-y-1">
                  <span className={labelClass}>{field.label} (LKR)</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={draft[field.key]}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, [field.key]: num(e.target.value) }))
                    }
                    className={inputClass}
                  />
                </label>
              ))}
          </div>
        ))}
      </div>

      {error ? <StatusBanner message={error} isError /> : null}

      <button type="button" onClick={save} disabled={isPending} className={btnPrimary}>
        {isPending ? 'Saving…' : 'Save website rules'}
      </button>
    </section>
  );
}

function WfmSection({
  defaultRate,
  subscribers,
  onSaved,
}: {
  defaultRate: number;
  subscribers: ForgeWfmPricingRow[];
  onSaved: (message: string) => void;
}) {
  const [defaultDraft, setDefaultDraft] = useState(String(defaultRate));
  const [subscriberDrafts, setSubscriberDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setDefaultDraft(String(defaultRate));
    setSubscriberDrafts(
      Object.fromEntries(subscribers.map((row) => [row.purchaseId ?? row.id, String(row.perEmployeeLkr)])),
    );
  }, [defaultRate, subscribers]);

  const saveDefault = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateForgeWfmDefaultPricing(num(defaultDraft));
      if (!result.success) {
        setError(result.error ?? 'Save failed');
        return;
      }
      onSaved('WFM default per-employee rate saved.');
    });
  };

  const saveSubscriber = (row: ForgeWfmPricingRow) => {
    if (!row.purchaseId) return;
    setError(null);
    startTransition(async () => {
      const result = await updateForgeWfmSubscriberPricing({
        purchaseId: row.purchaseId!,
        perEmployeeLkr: num(subscriberDrafts[row.purchaseId!] ?? '0'),
        employeeCount: row.employeeCount,
      });
      if (!result.success) {
        setError(result.error ?? 'Save failed');
        return;
      }
      onSaved(`Pricing saved for ${row.name}.`);
    });
  };

  return (
    <section className={`${T.card} p-5 sm:p-6 space-y-5`}>
      <div>
        <h2 className="text-base font-bold text-slate-900">WFM Tool</h2>
        <p className="mt-1 text-sm text-slate-500">
          Default monthly per-employee rate. Override individual subscribers when a client negotiated a
          different seat price.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
        <label className="space-y-1">
          <span className={labelClass}>Default per employee (LKR / mo)</span>
          <input
            type="number"
            min="0"
            step="1"
            value={defaultDraft}
            onChange={(e) => setDefaultDraft(e.target.value)}
            className={`${inputClass} w-44`}
          />
        </label>
        <button type="button" onClick={saveDefault} disabled={isPending} className={btnPrimary}>
          Save default
        </button>
      </div>

      {subscribers.length > 0 ? (
        <div className={`${T.tableWrap} overflow-x-auto`}>
          <table className="min-w-full text-sm">
            <thead>
              <tr className={T.tableHead}>
                <th className="px-4 py-3 text-left">Subscriber</th>
                <th className="px-4 py-3 text-right">Employees</th>
                <th className="px-4 py-3 text-right">Per employee</th>
                <th className="px-4 py-3 text-right">Monthly total</th>
                <th className="px-4 py-3 text-right"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {subscribers.map((row) => {
                const key = row.purchaseId ?? row.id;
                const draftRate = num(subscriberDrafts[key] ?? '0');
                const monthly =
                  row.employeeCount > 0 ? draftRate * row.employeeCount : draftRate;

                return (
                  <tr key={key} className={T.tableRow}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{row.name}</p>
                      {row.hasOverride ? (
                        <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600">
                          Custom rate
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">{row.employeeCount}</td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={subscriberDrafts[key] ?? ''}
                        onChange={(e) =>
                          setSubscriberDrafts((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        className={`${inputClass} ml-auto w-28 text-right`}
                        disabled={!row.purchaseId}
                      />
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">
                      {formatLkr(monthly)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.purchaseId ? (
                        <button
                          type="button"
                          onClick={() => saveSubscriber(row)}
                          disabled={isPending}
                          className="text-xs font-bold uppercase tracking-wider text-violet-600 hover:text-violet-800"
                        >
                          Save
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">No purchase</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-500">No WFM purchases yet.</p>
      )}

      {error ? <StatusBanner message={error} isError /> : null}
    </section>
  );
}

function CustomPricingFields({
  pricing,
  onChange,
}: {
  pricing: ForgeCustomPricingDefaults;
  onChange: (next: ForgeCustomPricingDefaults) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1">
        <span className={labelClass}>Pre-handover (LKR)</span>
        <input
          type="number"
          min="0"
          value={pricing.preHandoverLkr}
          onChange={(e) => onChange({ ...pricing, preHandoverLkr: num(e.target.value) })}
          className={inputClass}
        />
      </label>
      <label className="space-y-1">
        <span className={labelClass}>Post-handover (LKR)</span>
        <input
          type="number"
          min="0"
          value={pricing.postHandoverLkr}
          onChange={(e) => onChange({ ...pricing, postHandoverLkr: num(e.target.value) })}
          className={inputClass}
        />
      </label>
      <label className="space-y-1 sm:col-span-2">
        <span className={labelClass}>Monthly billing mode</span>
        <select
          value={pricing.monthlyMode}
          onChange={(e) =>
            onChange({
              ...pricing,
              monthlyMode: e.target.value === 'per_employee' ? 'per_employee' : 'fixed',
            })
          }
          className={inputClass}
        >
          <option value="fixed">Fixed monthly amount</option>
          <option value="per_employee">Per active employee</option>
        </select>
      </label>
      {pricing.monthlyMode === 'fixed' ? (
        <label className="space-y-1 sm:col-span-2">
          <span className={labelClass}>Monthly fixed (LKR)</span>
          <input
            type="number"
            min="0"
            value={pricing.monthlyFixedLkr}
            onChange={(e) => onChange({ ...pricing, monthlyFixedLkr: num(e.target.value) })}
            className={inputClass}
          />
        </label>
      ) : (
        <label className="space-y-1 sm:col-span-2">
          <span className={labelClass}>Monthly per employee (LKR)</span>
          <input
            type="number"
            min="0"
            value={pricing.monthlyPerEmployeeLkr}
            onChange={(e) =>
              onChange({ ...pricing, monthlyPerEmployeeLkr: num(e.target.value) })
            }
            className={inputClass}
          />
        </label>
      )}
    </div>
  );
}

function CustomSection({
  defaults,
  clients,
  onSaved,
}: {
  defaults: ForgeCustomPricingDefaults;
  clients: ForgeCustomPricingRow[];
  onSaved: (message: string) => void;
}) {
  const [defaultDraft, setDefaultDraft] = useState(defaults);
  const [clientDrafts, setClientDrafts] = useState<Record<string, ForgeCustomPricingDefaults>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setDefaultDraft(defaults);
    setClientDrafts(Object.fromEntries(clients.map((row) => [row.purchaseId, row.pricing])));
  }, [defaults, clients]);

  const saveDefaults = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateForgeCustomDefaultPricing(defaultDraft);
      if (!result.success) {
        setError(result.error ?? 'Save failed');
        return;
      }
      onSaved('Custom software default pricing saved.');
    });
  };

  const saveClient = (row: ForgeCustomPricingRow) => {
    setError(null);
    startTransition(async () => {
      const result = await updateForgeCustomClientPricing({
        purchaseId: row.purchaseId,
        pricing: clientDrafts[row.purchaseId] ?? row.pricing,
      });
      if (!result.success) {
        setError(result.error ?? 'Save failed');
        return;
      }
      onSaved(`Pricing saved for ${row.projectName}.`);
    });
  };

  return (
    <section className={`${T.card} p-5 sm:p-6 space-y-6`}>
      <div>
        <h2 className="text-base font-bold text-slate-900">Custom software</h2>
        <p className="mt-1 text-sm text-slate-500">
          Milestone amounts during build, handover fee, and ongoing monthly (fixed or per-employee).
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-700">Catalog defaults</p>
        <CustomPricingFields pricing={defaultDraft} onChange={setDefaultDraft} />
        <button type="button" onClick={saveDefaults} disabled={isPending} className={btnPrimary}>
          Save defaults
        </button>
      </div>

      {clients.length > 0 ? (
        <div className="space-y-4">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Per-client overrides</p>
          {clients.map((row) => (
            <div
              key={row.purchaseId}
              className="space-y-4 rounded-xl border border-slate-200 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900">{row.projectName}</p>
                  <p className="text-xs text-slate-500">{row.buyerName}</p>
                  {row.hasOverride ? (
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-violet-600">
                      Custom package
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => saveClient(row)}
                  disabled={isPending}
                  className={btnPrimary}
                >
                  Save client
                </button>
              </div>
              <CustomPricingFields
                pricing={clientDrafts[row.purchaseId] ?? row.pricing}
                onChange={(next) =>
                  setClientDrafts((prev) => ({ ...prev, [row.purchaseId]: next }))
                }
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">No custom software engagements yet.</p>
      )}

      {error ? <StatusBanner message={error} isError /> : null}
    </section>
  );
}

export default function ForgePricingSettingsPage() {
  const [dashboard, setDashboard] = useState<ForgePricingDashboard | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    const result = await fetchForgePricingDashboard();
    if (result.success && result.dashboard) {
      setDashboard(result.dashboard);
      setLoadError(null);
    } else {
      setDashboard(null);
      setLoadError(result.error ?? 'Failed to load pricing settings');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSaved = (message: string) => {
    setSaveMessage(message);
    void load();
  };

  return (
    <div className={`${T.page} pb-20`}>
      <div className={`${T.header} px-4 py-5 sm:px-6`}>
        <div className={`${T.container} flex flex-wrap items-start justify-between gap-4`}>
          <div>
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Client pricing</h1>
            <p className={T.headerSubtitle}>Website · WFM · Custom software</p>
          </div>
          <Link
            href="/forge/settings"
            className="text-xs font-bold uppercase tracking-wider text-violet-600 hover:text-violet-800"
          >
            Access control →
          </Link>
        </div>
      </div>

      <div className={`${T.container} space-y-6 px-4 py-8 sm:px-6`}>
        <p className="text-sm text-slate-500">
          Change client charges and revenue splits without code deploys. Product list prices for new
          sales remain under{' '}
          <Link href="/forge/commerce/pricing" className="font-medium text-violet-600 hover:underline">
            Commerce → Product Pricing
          </Link>
          .
        </p>

        {loadError ? <StatusBanner message={loadError} isError /> : null}
        {saveMessage ? <StatusBanner message={saveMessage} /> : null}

        {isLoading ? (
          <p className="animate-pulse text-sm text-slate-500">Loading pricing settings…</p>
        ) : dashboard ? (
          <div className="space-y-6">
            <WebsiteRulesSection rules={dashboard.websiteRules} onSaved={handleSaved} />
            <WfmSection
              defaultRate={dashboard.wfmDefaults.perEmployeeLkr}
              subscribers={dashboard.wfmSubscribers}
              onSaved={handleSaved}
            />
            <CustomSection
              defaults={dashboard.customDefaults}
              clients={dashboard.customClients}
              onSaved={handleSaved}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
