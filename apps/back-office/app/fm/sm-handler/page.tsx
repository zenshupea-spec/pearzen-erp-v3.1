'use client';

import React, { useEffect, useState } from 'react';
import FmSubnav from '../components/FmSubnav';
import { useFmHolidayCalendarIncomplete } from '../use-fm-holiday-calendar-incomplete';
import { usePathname } from 'next/navigation';
import OmCommandShellLayout from '../../om/components/OmCommandShellLayout';
import {
  getSmVisitCapsData,
  type SmVisitCapsProfile,
  type SmVisitCapsSiteRow,
  type SmVisitLogEntry,
} from './actions';
import {
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  MapPin,
  UserCheck,
} from 'lucide-react';

// ─── Glass Card ───────────────────────────────────────────────────────────────

function DarkGlassCard({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100 ${className}`.trim()}
    >
      {children}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function smSiteCount(smId: string, siteFreqs: Record<string, SmVisitCapsSiteRow[]>): number {
  return (siteFreqs[smId] ?? []).length;
}

function sortSmRosterBySiteCount(
  roster: SmVisitCapsProfile[],
  siteFreqs: Record<string, SmVisitCapsSiteRow[]>,
): SmVisitCapsProfile[] {
  return [...roster].sort((a, b) => {
    const bySites = smSiteCount(b.smId, siteFreqs) - smSiteCount(a.smId, siteFreqs);
    if (bySites !== 0) return bySites;
    return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
  });
}

/** Matches FM Settings → Sector Manager per-visit rate preview default */
const DEFAULT_SM_VISIT_RATE_LKR = 2000;

function formatLkr(amount: number): string {
  return `LKR ${amount.toLocaleString('en-LK')}`;
}

function monthlyVisitPay(monthlyTarget: number, rate = DEFAULT_SM_VISIT_RATE_LKR): number {
  return monthlyTarget * rate;
}

function totalMonthlyVisitPay(sites: SmVisitCapsSiteRow[], rate = DEFAULT_SM_VISIT_RATE_LKR): number {
  return sites.reduce((sum, s) => sum + monthlyVisitPay(s.monthlyTarget, rate), 0);
}

function totalMonthlyVisits(sites: SmVisitCapsSiteRow[]): number {
  return sites.reduce((sum, s) => sum + s.monthlyTarget, 0);
}

/** Keep daily ≤ weekly ≤ monthly; derive companion caps when one field changes. */
function deriveVisitFrequencies(
  field: keyof Pick<SmVisitCapsSiteRow, 'dailyCap' | 'weeklyCap' | 'monthlyTarget'>,
  dailyCap: number,
  weeklyCap: number,
  monthlyTarget: number,
): Pick<SmVisitCapsSiteRow, 'dailyCap' | 'weeklyCap' | 'monthlyTarget'> {
  const clamp = (n: number) => Math.max(0, Math.min(31, Math.floor(n) || 0));
  let daily = clamp(dailyCap);
  let weekly = clamp(weeklyCap);
  let monthly = clamp(monthlyTarget);

  if (field === 'monthlyTarget') {
    if (monthly === 0) {
      return { dailyCap: 0, weeklyCap: 0, monthlyTarget: 0 };
    }
    daily = 1;
    weekly = Math.min(monthly, Math.max(1, Math.ceil(monthly / 2)));
    return { dailyCap: daily, weeklyCap: weekly, monthlyTarget: monthly };
  }

  if (field === 'weeklyCap') {
    if (weekly === 0) {
      return { dailyCap: 0, weeklyCap: 0, monthlyTarget: monthly === 0 ? 0 : monthly };
    }
    daily = Math.min(weekly, Math.max(daily > 0 ? daily : 1, 1));
    monthly = Math.max(monthly, weekly);
    return { dailyCap: daily, weeklyCap: weekly, monthlyTarget: monthly };
  }

  if (field === 'dailyCap') {
    weekly = Math.max(weekly, daily);
    monthly = Math.max(monthly, weekly);
    return { dailyCap: daily, weeklyCap: weekly, monthlyTarget: monthly };
  }

  return { dailyCap: daily, weeklyCap: weekly, monthlyTarget: monthly };
}

const VISIT_FREQ_FIELDS: {
  field: keyof Pick<SmVisitCapsSiteRow, 'dailyCap' | 'weeklyCap' | 'monthlyTarget'>;
  short: string;
  unit: string;
}[] = [
  { field: 'dailyCap', short: 'D', unit: '/day' },
  { field: 'weeklyCap', short: 'W', unit: '/week' },
  { field: 'monthlyTarget', short: 'M', unit: '/month' },
];

function computeVisitScore(
  smId: string,
  windowDays: number,
  sites: SmVisitCapsSiteRow[],
  allLogs: SmVisitLogEntry[],
): number {
  if (sites.length === 0) return 0;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const completed = allLogs.filter(
    (l) => l.smId === smId && l.date >= cutoffStr,
  ).length;
  const required = sites.reduce((acc, s) => acc + s.monthlyTarget * (windowDays / 30), 0);
  if (required === 0) return 0;
  return Math.min(100, Math.round((completed / required) * 100));
}

// ─── Score Pill ───────────────────────────────────────────────────────────────

function ScorePill({ label, score }: { label: string; score: number }) {
  const [bg, text] =
    score >= 80 ? ['bg-emerald-50 border-emerald-200', 'text-emerald-700'] :
    score >= 55 ? ['bg-amber-50 border-amber-200',     'text-amber-700']   :
                  ['bg-rose-50 border-rose-200',        'text-rose-700'];
  return (
    <div className={`flex flex-col items-center rounded-xl border px-3 py-1.5 ${bg}`}>
      <p className={`text-xs font-bold uppercase tracking-wider ${text} opacity-70`}>{label}</p>
      <p className={`text-lg font-black tabular-nums leading-tight ${text}`}>{score}%</p>
    </div>
  );
}

// ─── SM Handler Tab ───────────────────────────────────────────────────────────

function SMHandlerTab({
  roster,
  visitLogs,
  selectedSmId,
  setSelectedSmId,
  siteFreqs,
  setSiteFreqs,
  drafts,
  setDrafts,
  loadError,
}: {
  roster: SmVisitCapsProfile[];
  visitLogs: SmVisitLogEntry[];
  selectedSmId: string;
  setSelectedSmId: React.Dispatch<React.SetStateAction<string>>;
  siteFreqs: Record<string, SmVisitCapsSiteRow[]>;
  setSiteFreqs: React.Dispatch<React.SetStateAction<Record<string, SmVisitCapsSiteRow[]>>>;
  drafts: Record<string, SmVisitCapsSiteRow[]>;
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, SmVisitCapsSiteRow[]>>>;
  loadError?: string;
}) {
  const [savedSmId, setSavedSmId] = useState<string | null>(null);

  const sm = roster.find((s) => s.smId === selectedSmId) ?? null;
  const baseSites = siteFreqs[selectedSmId] ?? [];
  const currentRows: SmVisitCapsSiteRow[] = drafts[selectedSmId] ?? baseSites;

  const score7  = sm ? computeVisitScore(sm.smId, 7,  baseSites, visitLogs) : 0;
  const score30 = sm ? computeVisitScore(sm.smId, 30, baseSites, visitLogs) : 0;
  const score60 = sm ? computeVisitScore(sm.smId, 60, baseSites, visitLogs) : 0;

  const monthlyVisitCount = totalMonthlyVisits(currentRows);
  const monthlyVisitEarnings = totalMonthlyVisitPay(currentRows);

  const isDirty = selectedSmId in drafts;

  function updateRow(siteId: string, field: keyof SmVisitCapsSiteRow, raw: string) {
    const val = Math.max(0, parseInt(raw, 10) || 0);
    setDrafts((prev) => {
      const base = prev[selectedSmId] ?? [...baseSites];
      return {
        ...prev,
        [selectedSmId]: base.map((r) => {
          if (r.siteId !== siteId) return r;
          if (field !== 'dailyCap' && field !== 'weeklyCap' && field !== 'monthlyTarget') {
            return { ...r, [field]: val };
          }
          const next = deriveVisitFrequencies(
            field,
            field === 'dailyCap' ? val : r.dailyCap,
            field === 'weeklyCap' ? val : r.weeklyCap,
            field === 'monthlyTarget' ? val : r.monthlyTarget,
          );
          return { ...r, ...next };
        }),
      };
    });
  }

  function handleSave() {
    if (!selectedSmId || !isDirty) return;
    setSiteFreqs((prev) => ({ ...prev, [selectedSmId]: drafts[selectedSmId] }));
    setDrafts((prev) => { const n = { ...prev }; delete n[selectedSmId]; return n; });
    setSavedSmId(selectedSmId);
    setTimeout(() => setSavedSmId(null), 2500);
  }

  function handleDiscard() {
    setDrafts((prev) => { const n = { ...prev }; delete n[selectedSmId]; return n; });
  }

  const smRosterSorted = sortSmRosterBySiteCount(roster, siteFreqs);

  const totalAssigned = roster.filter((s) => s.sector.trim() !== '').length;
  const totalSites    = Object.values(siteFreqs).reduce((a, v) => a + v.length, 0);
  const sitesNoVisitPlan = Object.values(siteFreqs).reduce(
    (a, v) => a + v.filter((s) => s.dailyCap === 0 && s.weeklyCap === 0 && s.monthlyTarget === 0).length,
    0,
  );

  if (roster.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-6 py-16 text-center">
        <UserCheck className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-3 text-sm font-bold text-slate-700">No sector managers in MNR</p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
          Active sector managers from the employee registry appear here once onboarded. Assign sites via SM assignments.
        </p>
        {loadError ? (
          <p className="mx-auto mt-3 max-w-md text-xs font-semibold text-amber-800">{loadError}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50">
          <UserCheck className="h-4 w-4 text-indigo-600" />
        </div>
        <div>
          <p className="text-base font-black text-slate-900">SM Handler</p>
          <p className="text-sm text-slate-500">Assign site visit frequencies per sector manager</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total SMs',       value: String(roster.length), dot: 'bg-indigo-500',  color: 'text-slate-900'   },
          { label: 'Sector Assigned', value: String(totalAssigned),    dot: 'bg-emerald-500', color: 'text-emerald-700' },
          { label: 'Unassigned to Visit', value: String(sitesNoVisitPlan), dot: sitesNoVisitPlan > 0 ? 'bg-amber-500' : 'bg-slate-300', color: sitesNoVisitPlan > 0 ? 'text-amber-700' : 'text-slate-400' },
          { label: 'Total Sites',     value: String(totalSites),       dot: 'bg-sky-500',     color: 'text-slate-900'   },
        ].map((s) => (
          <DarkGlassCard key={s.label} className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{s.label}</p>
            </div>
            <p className={`text-2xl font-black tabular-nums ${s.color}`}>{s.value}</p>
          </DarkGlassCard>
        ))}
      </div>

      <DarkGlassCard className="p-5">
        <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
          Select Sector Manager
        </label>
        <div className="relative">
          <select
            value={selectedSmId}
            onChange={(e) => setSelectedSmId(e.target.value)}
            className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 pr-10 text-sm font-bold text-slate-800 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          >
            {smRosterSorted.map((s) => (
              <option key={s.smId} value={s.smId}>
                {s.name}  ·  {s.empNo}{s.sector ? `  ·  ${s.sector}` : '  ·  (no sector)'}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        </div>
      </DarkGlassCard>

      {sm && (
        <>
          <DarkGlassCard className="overflow-hidden">
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50">
                  <UserCheck className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <p className="text-base font-black text-slate-900">{sm.name}</p>
                  <p className="text-xs text-slate-400">{sm.empNo} · {sm.phone} · {sm.sector || <span className="italic text-amber-600">No sector</span>}</p>
                  {currentRows.length > 0 && (
                    <p className="mt-1 text-xs text-emerald-700">
                      <span className="font-bold">Max visit pay this month</span>
                      {' '}
                      if all targets met:{' '}
                      <span className="font-black tabular-nums">{formatLkr(monthlyVisitEarnings)}</span>
                      {' '}
                      <span className="text-emerald-600/80">
                        ({monthlyVisitCount} visit{monthlyVisitCount === 1 ? '' : 's'} × {formatLkr(DEFAULT_SM_VISIT_RATE_LKR)})
                      </span>
                    </p>
                  )}
                </div>
              </div>
              {currentRows.length > 0 && (
                <div className="hidden sm:flex flex-col items-end rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 flex-shrink-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700/70">Visit pay / month</p>
                  <p className="text-lg font-black tabular-nums leading-tight text-emerald-800">{formatLkr(monthlyVisitEarnings)}</p>
                  <p className="text-[10px] text-emerald-700/80">if all completed</p>
                </div>
              )}
              <div className="flex items-center gap-2 flex-shrink-0">
                <ScorePill label="7 d" score={score7} />
                <ScorePill label="30 d" score={score30} />
                <ScorePill label="60 d" score={score60} />
              </div>
            </div>
            <div className="border-t border-slate-100 bg-slate-50 px-5 py-2.5">
              <p className="text-xs text-slate-400">
                Scores show <span className="font-bold text-slate-600">site visit completion rate</span> over rolling windows — visits logged ÷ monthly targets pro-rated to window.
              </p>
            </div>
          </DarkGlassCard>

          <DarkGlassCard className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-indigo-500" />
                <p className="text-sm font-black text-slate-900">
                  Assigned Sites
                  <span className="ml-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-bold text-slate-500">
                    {currentRows.length}
                  </span>
                </p>
              </div>
              {isDirty && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDiscard}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-50"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-600 px-3 py-1.5 text-xs font-black text-white hover:bg-indigo-700"
                  >
                    <Check className="h-3 w-3" />
                    Save Assignments
                  </button>
                </div>
              )}
              {savedSmId === selectedSmId && !isDirty && (
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Saved
                </div>
              )}
            </div>

            {currentRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <Building2 className="h-8 w-8 text-slate-200" />
                <p className="text-sm font-bold text-slate-400">No sites assigned to this SM yet</p>
                <p className="text-xs text-slate-400">Sites are assigned by MD or FM in the site directory</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-[1fr_auto] items-center border-b border-slate-100 bg-slate-50 px-5 py-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Site</p>
                  <div className="flex items-center gap-6 pr-1">
                    {VISIT_FREQ_FIELDS.map(({ short, unit, field }) => (
                      <div key={field} className="w-14 text-center" title={
                        field === 'dailyCap'
                          ? 'Max visits per day'
                          : field === 'weeklyCap'
                            ? 'Max visits per week'
                            : 'Required visits per month'
                      }>
                        <p className="text-xs font-black uppercase tracking-widest text-slate-500">{short}</p>
                        <p className="text-[10px] text-slate-400 leading-tight">{unit}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="divide-y divide-slate-50">
                  {currentRows.map((row) => (
                    <div
                      key={row.siteId}
                      className="grid grid-cols-[1fr_auto] items-center px-5 py-3.5 hover:bg-slate-50 transition-colors"
                    >
                      <div className="min-w-0 pr-4">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-indigo-400" />
                          <p className="text-sm font-black text-slate-900 truncate">{row.siteName}</p>
                        </div>
                        <p className="mt-0.5 pl-5 text-xs text-slate-400 truncate">{row.client} · {row.location}</p>
                        <p className="mt-1 pl-5 text-xs text-slate-400">
                          Rule: max{' '}
                          <span className="font-bold text-slate-600">{row.dailyCap}</span>/day,{' '}
                          <span className="font-bold text-slate-600">{row.weeklyCap}</span>/week,{' '}
                          target <span className="font-bold text-slate-600">{row.monthlyTarget}</span>/month
                          {row.monthlyTarget > 0 && row.dailyCap <= row.weeklyCap && row.weeklyCap <= row.monthlyTarget ? (
                            <span className="text-emerald-600"> · synced</span>
                          ) : null}
                        </p>
                        {row.monthlyTarget > 0 && (
                          <p className="mt-1 pl-5 text-xs font-bold text-emerald-700">
                            If all visits completed:{' '}
                            <span className="tabular-nums">{formatLkr(monthlyVisitPay(row.monthlyTarget))}</span>
                            /month
                            <span className="font-normal text-emerald-600/90">
                              {' '}
                              ({row.monthlyTarget} × {formatLkr(DEFAULT_SM_VISIT_RATE_LKR)})
                            </span>
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        {VISIT_FREQ_FIELDS.map(({ field, short, unit }) => {
                          const val = row[field];
                          return (
                          <div key={field} className="flex w-14 flex-col items-center gap-0.5">
                            <input
                              type="number"
                              min={0}
                              max={31}
                              value={val}
                              aria-label={`${row.siteName} ${short} ${unit}`}
                              onChange={(e) => updateRow(row.siteId, field, e.target.value)}
                              className="w-full rounded-lg border border-slate-200 bg-white px-0 py-1.5 text-center text-sm font-black text-slate-800 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 tabular-nums"
                            />
                            <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
                              {unit}
                            </span>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {isDirty && (
                  <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-indigo-50 px-5 py-3">
                    <p className="flex-1 text-xs text-indigo-600 font-bold">Unsaved changes</p>
                    <button
                      type="button"
                      onClick={handleDiscard}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-50"
                    >
                      Discard
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-600 px-4 py-1.5 text-xs font-black text-white hover:bg-indigo-700"
                    >
                      <Check className="h-3 w-3" />
                      Save
                    </button>
                  </div>
                )}
              </>
            )}
          </DarkGlassCard>

          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-xs font-black uppercase tracking-wider text-slate-400">Frequency legend</p>
            {[
              { key: 'D', label: 'Daily cap — max visits on any one day (auto-set to 1 when monthly target is set)' },
              { key: 'W', label: 'Weekly cap — auto-derived from monthly (about half the monthly target, min 1)' },
              { key: 'M', label: 'Monthly target — visits required this month; drives day & week caps' },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center gap-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded border border-slate-300 bg-white text-xs font-black text-slate-700">{key}</span>
                <span className="text-xs text-slate-500">{label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SMHandlerPage() {
  const pathname = usePathname() ?? '';
  const isOmPortal = pathname.startsWith('/om/');
  const holidayCalendarIncomplete = useFmHolidayCalendarIncomplete();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [roster, setRoster] = useState<SmVisitCapsProfile[]>([]);
  const [visitLogs, setVisitLogs] = useState<SmVisitLogEntry[]>([]);
  const [selectedSmId, setSelectedSmId] = useState<string>('');
  const [siteFreqs, setSiteFreqs] = useState<Record<string, SmVisitCapsSiteRow[]>>({});
  const [drafts, setDrafts] = useState<Record<string, SmVisitCapsSiteRow[]>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const data = await getSmVisitCapsData();
      if (cancelled) return;
      setRoster(data.roster);
      setSiteFreqs(data.siteFreqs);
      setVisitLogs(data.visitLogs);
      setLoadError(data.error);
      const sorted = sortSmRosterBySiteCount(data.roster, data.siteFreqs);
      setSelectedSmId(sorted[0]?.smId ?? '');
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const smHandlerBody = loading ? (
    <div className="space-y-4 animate-pulse">
      <div className="h-20 rounded-2xl bg-slate-100" />
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-slate-100" />
        ))}
      </div>
      <div className="h-64 rounded-2xl bg-slate-100" />
    </div>
  ) : (
    <>
      <p className="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
        Live sector managers and assigned sites from MNR. Visit scores use SM portal logs. Cap edits are session-only until visit targets are persisted in Supabase.
      </p>
      <SMHandlerTab
        roster={roster}
        visitLogs={visitLogs}
        selectedSmId={selectedSmId}
        setSelectedSmId={setSelectedSmId}
        siteFreqs={siteFreqs}
        setSiteFreqs={setSiteFreqs}
        drafts={drafts}
        setDrafts={setDrafts}
        loadError={loadError}
      />
    </>
  );

  if (isOmPortal) {
    return (
      <OmCommandShellLayout
        title="SM visit caps"
        subtitle="Configure daily, weekly, and monthly visit targets per sector manager"
        icon={UserCheck}
        accent="indigo"
        maxWidth="7xl"
      >
        {smHandlerBody}
      </OmCommandShellLayout>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-25"
        style={{
          backgroundImage: 'radial-gradient(rgb(148 163 184 / 0.5) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        <FmSubnav holidayCalendarIncomplete={holidayCalendarIncomplete} />

        {/* Page Header */}
        <header className="mb-8 border-b border-slate-200 pb-6">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50">
              <UserCheck className="h-4 w-4 text-indigo-700" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">
              Finance Manager Portal
            </span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            SM Handler — Sector Manager Visit Frequencies
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-500">
            Assign and manage site visit frequency targets per Sector Manager. Track rolling completion scores and configure daily, weekly, and monthly visit caps.
          </p>
        </header>

        {smHandlerBody}
      </div>
    </div>
  );
}
