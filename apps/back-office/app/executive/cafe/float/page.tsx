'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Wallet } from 'lucide-react';

import { ExecutiveGlassCard } from '../../../../components/executive/ExecutiveVaultShell';
import { ExecutivePageLoading } from '../../../../components/executive/ExecutivePageChrome';
import { colomboTodayIso } from '../../../../lib/guard-verification-dates';
import { isCafeHubView } from '../../../../lib/hq-hub';
import {
  fetchExecutiveSessionProfile,
  type ExecutiveSessionProfile,
} from '../../actions';
import { CafePortalShell } from '../CafePortalShell';
import {
  getCafeFloatDesk,
  saveCafeFloatReconciliation,
  type CafeFloatSession,
} from '../cafe-float-actions';
import { useCafeBranchScope } from '../use-cafe-branch';

function formatLkr(value: number) {
  return `LKR ${value.toLocaleString()}`;
}

function CafeFloatPanel({
  session,
  recentSessions,
  businessDate,
  onBusinessDateChange,
  onReconcile,
  saving,
  saveError,
}: {
  session: CafeFloatSession;
  recentSessions: CafeFloatSession[];
  businessDate: string;
  onBusinessDateChange: (date: string) => void;
  onReconcile: (openingFloatLkr: number, declaredCashLkr: number, notes: string) => void;
  saving: boolean;
  saveError: string | null;
}) {
  const [openingFloatLkr, setOpeningFloatLkr] = useState(session.openingFloatLkr);
  const [declaredCashLkr, setDeclaredCashLkr] = useState(
    session.declaredCashLkr ?? '',
  );
  const [notes, setNotes] = useState(session.notes);

  const isLocked = Boolean(session.reconciledAt);
  const expectedCashLkr = openingFloatLkr + session.posCashSalesLkr;

  useEffect(() => {
    setOpeningFloatLkr(session.openingFloatLkr);
    setDeclaredCashLkr(session.declaredCashLkr ?? '');
    setNotes(session.notes);
  }, [session]);

  return (
    <div className="space-y-6">
      <ExecutiveGlassCard className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-slate-50/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-emerald-200/80 bg-emerald-50/80">
              <Wallet className="h-5 w-5 text-emerald-700" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Cash Float Reconciliation</h3>
              <p className="text-sm font-medium text-slate-600">
                Opening float + pay-at-counter sales vs physical cash count
              </p>
            </div>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Business date
            </span>
            <input
              type="date"
              value={businessDate}
              max={colomboTodayIso()}
              disabled={isLocked}
              onChange={(event) => onBusinessDateChange(event.target.value)}
              className="rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm font-bold text-slate-800"
            />
          </label>
        </div>

        <div className="grid gap-4 p-6 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200/80 bg-white/60 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Opening float
            </p>
            <input
              type="number"
              min={0}
              disabled={isLocked}
              value={openingFloatLkr}
              onChange={(event) => setOpeningFloatLkr(Number(event.target.value) || 0)}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-right font-mono text-lg font-black text-slate-900"
            />
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white/60 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              POS cash sales
            </p>
            <p className="mt-2 text-right font-mono text-lg font-black text-emerald-900">
              {formatLkr(session.posCashSalesLkr)}
            </p>
          </div>
          <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-700">
              Expected in drawer
            </p>
            <p className="mt-2 text-right font-mono text-lg font-black text-indigo-900">
              {formatLkr(expectedCashLkr)}
            </p>
          </div>
        </div>

        {!isLocked ? (
          <form
            className="space-y-4 border-t border-slate-200/60 px-6 py-5"
            onSubmit={(event) => {
              event.preventDefault();
              onReconcile(
                openingFloatLkr,
                Number(declaredCashLkr) || 0,
                notes,
              );
            }}
          >
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Physical cash counted (LKR)
              </label>
              <input
                type="number"
                min={0}
                required
                value={declaredCashLkr}
                onChange={(event) => setDeclaredCashLkr(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-right font-mono text-2xl font-black text-slate-900"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                placeholder="Shortage explanation, handover notes…"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Lock reconciliation'}
            </button>
            {saveError ? (
              <p className="text-xs font-bold text-rose-600">{saveError}</p>
            ) : null}
          </form>
        ) : (
          <div className="space-y-3 border-t border-slate-200/60 px-6 py-5">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-800">
              <CheckCircle2 className="h-4 w-4" />
              Reconciled {session.reconciledAt ? new Date(session.reconciledAt).toLocaleString() : ''}
              {session.reconciledBy ? ` · ${session.reconciledBy}` : ''}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200/80 bg-white/60 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Declared cash
                </p>
                <p className="mt-1 font-mono text-xl font-black text-slate-900">
                  {formatLkr(session.declaredCashLkr ?? 0)}
                </p>
              </div>
              <div
                className={`rounded-xl border p-4 ${
                  (session.varianceLkr ?? 0) === 0
                    ? 'border-emerald-200/80 bg-emerald-50/60'
                    : 'border-amber-200/80 bg-amber-50/60'
                }`}
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
                  Variance
                </p>
                <p className="mt-1 font-mono text-xl font-black text-slate-900">
                  {(session.varianceLkr ?? 0) > 0 ? '+' : ''}
                  {formatLkr(session.varianceLkr ?? 0)}
                </p>
              </div>
            </div>
            {session.notes ? (
              <p className="text-sm text-slate-600">{session.notes}</p>
            ) : null}
          </div>
        )}
      </ExecutiveGlassCard>

      <ExecutiveGlassCard className="overflow-hidden">
        <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4">
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-700">
            Recent reconciliations
          </h3>
        </div>
        {recentSessions.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-500">
            No locked float sessions yet for this branch.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200/80 bg-slate-50/60 text-xs font-bold uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-right">Expected</th>
                  <th className="px-4 py-3 text-right">Declared</th>
                  <th className="px-4 py-3 text-right">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60">
                {recentSessions.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 font-semibold text-slate-800">{row.businessDate}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {formatLkr(row.expectedCashLkr)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {formatLkr(row.declaredCashLkr ?? 0)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono font-bold tabular-nums ${
                        (row.varianceLkr ?? 0) === 0 ? 'text-emerald-800' : 'text-amber-800'
                      }`}
                    >
                      {(row.varianceLkr ?? 0) > 0 ? '+' : ''}
                      {formatLkr(row.varianceLkr ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ExecutiveGlassCard>
    </div>
  );
}

export default function CafeFloatPage() {
  const pathname = usePathname();
  const {
    branches,
    locationId,
    locationName,
    setLocationName,
    fromHub,
    handleBranchChange,
  } = useCafeBranchScope(pathname);
  const [sessionProfile, setSessionProfile] = useState<ExecutiveSessionProfile | null>(null);
  const [businessDate, setBusinessDate] = useState(colomboTodayIso());
  const [session, setSession] = useState<CafeFloatSession | null>(null);
  const [recentSessions, setRecentSessions] = useState<CafeFloatSession[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const hubView = isCafeHubView(sessionProfile?.rank, fromHub);

  const loadDesk = useCallback(async () => {
    if (!locationId) return;
    setLoading(true);
    setLoadError(null);
    const payload = await getCafeFloatDesk(locationId, businessDate);
    if (payload.error) setLoadError(payload.error);
    if (payload.session) setSession(payload.session);
    setRecentSessions(payload.recentSessions);
    const branch = branches.find((row) => row.id === locationId);
    if (branch) setLocationName(branch.name);
    setLoading(false);
  }, [branches, businessDate, locationId, setLocationName]);

  useEffect(() => {
    fetchExecutiveSessionProfile().then(setSessionProfile);
  }, []);

  useEffect(() => {
    void loadDesk();
  }, [loadDesk]);

  const handleReconcile = async (
    openingFloatLkr: number,
    declaredCashLkr: number,
    notes: string,
  ) => {
    if (!locationId) return;
    setSaving(true);
    setSaveError(null);
    const result = await saveCafeFloatReconciliation({
      locationId,
      businessDate,
      openingFloatLkr,
      declaredCashLkr,
      notes,
    });
    setSaving(false);
    if (!result.ok) {
      setSaveError(result.error ?? 'Failed to save reconciliation');
      return;
    }
    await loadDesk();
  };

  return (
    <CafePortalShell
      hubView={hubView}
      subtitle="Cash float · opening petty cash + counter sales reconciliation"
      branches={branches}
      selectedBranchId={locationId}
      onBranchChange={handleBranchChange}
      showBranchSelector={!hubView}
      locationName={locationName}
    >
      {loadError ? (
        <ExecutiveGlassCard className="border-rose-200/80 bg-rose-50/50 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-rose-900">
            <AlertTriangle className="h-4 w-4" />
            Could not load cash float desk
          </p>
          <p className="mt-1 text-xs text-rose-700">{loadError}</p>
        </ExecutiveGlassCard>
      ) : null}

      {loading || !session ? (
        <ExecutivePageLoading message="Loading cash float desk…" />
      ) : (
        <CafeFloatPanel
          session={session}
          recentSessions={recentSessions}
          businessDate={businessDate}
          onBusinessDateChange={setBusinessDate}
          onReconcile={handleReconcile}
          saving={saving}
          saveError={saveError}
        />
      )}
    </CafePortalShell>
  );
}
