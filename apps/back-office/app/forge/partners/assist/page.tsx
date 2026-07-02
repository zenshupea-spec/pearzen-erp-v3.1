'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';

import {
  fetchForgePartnerAssistOverview,
  upsertForgePartnerAssistGrant,
  type ForgeAssistPortfolioRow,
} from './actions';

export default function ForgePartnerAssistPage() {
  const [rows, setRows] = useState<ForgeAssistPortfolioRow[]>([]);
  const [drafts, setDrafts] = useState<
    Record<string, { domainSetup: boolean; payhereSetup: boolean; expiresAt: string }>
  >({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const rowKey = (row: ForgeAssistPortfolioRow) => `${row.partnerId}:${row.companyId}`;

  const load = async () => {
    setIsLoading(true);
    const result = await fetchForgePartnerAssistOverview();
    if (result.success) {
      setRows(result.rows);
      setDrafts(
        Object.fromEntries(
          result.rows.map((row) => [
            rowKey(row),
            {
              domainSetup: row.domainSetup,
              payhereSetup: row.payhereSetup,
              expiresAt: row.expiresAt?.slice(0, 10) ?? '',
            },
          ]),
        ),
      );
      setLoadError(null);
    } else {
      setLoadError(result.error ?? 'Failed to load assist grants');
    }
    setIsLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = (row: ForgeAssistPortfolioRow) => {
    const key = rowKey(row);
    const draft = drafts[key];
    if (!draft) return;

    startTransition(async () => {
      setActionMessage(null);
      const result = await upsertForgePartnerAssistGrant({
        partnerId: row.partnerId,
        companyId: row.companyId,
        domainSetup: draft.domainSetup,
        payhereSetup: draft.payhereSetup,
        expiresAt: draft.expiresAt || null,
      });

      if (!result.success) {
        setActionMessage(result.error ?? 'Failed to save grant');
        return;
      }

      setActionMessage(`Assist toggles updated for ${row.companyName}.`);
      await load();
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/forge"
          className="text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-white"
        >
          ← Forge home
        </Link>
        <h1 className="mt-2 text-2xl font-black text-white uppercase tracking-tight">
          Partner assist grants
        </h1>
        <p className="mt-2 text-sm text-slate-400 max-w-2xl">
          Enable domain setup and PayHere credential assist per partner portfolio row. Partners
          configure clients at{' '}
          <span className="font-mono text-slate-300">/partners/clients/[companyId]/setup</span>.
        </p>
      </div>

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

      <div className="rounded-2xl border border-slate-800 bg-[#111118] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#0a0a0e] text-slate-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3">Partner</th>
                <th className="px-4 py-3">Tenant</th>
                <th className="px-4 py-3">Portfolio</th>
                <th className="px-4 py-3">Domain assist</th>
                <th className="px-4 py-3">PayHere assist</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Loading portfolio grants…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No partner portfolio links yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const key = rowKey(row);
                  const draft = drafts[key] ?? {
                    domainSetup: row.domainSetup,
                    payhereSetup: row.payhereSetup,
                    expiresAt: '',
                  };

                  return (
                    <tr key={key} className="hover:bg-slate-900/40">
                      <td className="px-4 py-3">
                        <p className="font-medium text-white">{row.partnerName}</p>
                        <p className="text-xs text-slate-500">{row.partnerEmail}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{row.companyName}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-400">
                          {row.portfolioStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={draft.domainSetup}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [key]: { ...draft, domainSetup: e.target.checked },
                            }))
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={draft.payhereSetup}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [key]: { ...draft, payhereSetup: e.target.checked },
                            }))
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="date"
                          value={draft.expiresAt}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [key]: { ...draft, expiresAt: e.target.value },
                            }))
                          }
                          className="rounded border border-slate-700 bg-[#0a0a0e] px-2 py-1 text-xs text-white"
                        />
                      </td>
                      <td className="px-4 py-3 text-right space-x-3 whitespace-nowrap">
                        <Link
                          href={`/partners/clients/${row.companyId}/setup`}
                          className="text-xs font-bold uppercase text-cyan-400 hover:text-white"
                        >
                          Setup
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleSave(row)}
                          disabled={isPending}
                          className="text-xs font-bold uppercase text-rose-300 hover:text-white disabled:opacity-50"
                        >
                          Save
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
