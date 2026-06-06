'use client';

import React, { useState } from 'react';
import FmSubnav from '../components/FmSubnav';
import { usePathname } from 'next/navigation';
import OmCommandShell from '../../om/components/OmCommandShell';
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface SMProfileEntry {
  smId: string;
  name: string;
  empNo: string;
  phone: string;
  sector: string;
}

interface SMSiteFreqRow {
  siteId: string;
  siteName: string;
  client: string;
  location: string;
  dailyCap: number;
  weeklyCap: number;
  monthlyTarget: number;
}

interface SMVisitEntry {
  siteId: string;
  smId: string;
  date: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SM_ROSTER: SMProfileEntry[] = [
  { smId: 'SM-001', name: 'Dissanayake K.P.', empNo: 'EMP-SM-001', phone: '+94 77 123 4567', sector: 'Western Province A' },
  { smId: 'SM-002', name: 'Perera R.S.',      empNo: 'EMP-SM-002', phone: '+94 71 234 5678', sector: 'Western Province B' },
  { smId: 'SM-003', name: 'Fernando L.M.',    empNo: 'EMP-SM-003', phone: '+94 76 345 6789', sector: 'Central Province'   },
  { smId: 'SM-004', name: 'Jayasuriya N.T.',  empNo: 'EMP-SM-004', phone: '+94 75 456 7890', sector: 'Southern Province'  },
  { smId: 'SM-005', name: 'Gunasekara C.B.',  empNo: 'EMP-SM-005', phone: '+94 77 567 8901', sector: 'North Western'      },
  { smId: 'SM-006', name: 'Bandara H.W.',     empNo: 'EMP-SM-006', phone: '+94 72 678 9012', sector: ''                   },
];

function smSiteCount(smId: string, siteFreqs: Record<string, SMSiteFreqRow[]>): number {
  return (siteFreqs[smId] ?? []).length;
}

function sortSmRosterBySiteCount(
  roster: SMProfileEntry[],
  siteFreqs: Record<string, SMSiteFreqRow[]>,
): SMProfileEntry[] {
  return [...roster].sort((a, b) => {
    const bySites = smSiteCount(b.smId, siteFreqs) - smSiteCount(a.smId, siteFreqs);
    if (bySites !== 0) return bySites;
    return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
  });
}

const INITIAL_SITE_FREQS: Record<string, SMSiteFreqRow[]> = {
  'SM-001': [
    { siteId: 's1-1', siteName: 'Lanka Hospitals',        client: 'Lanka Hospitals PLC',       location: 'Narahenpita, Colombo 05',      dailyCap: 1, weeklyCap: 1, monthlyTarget: 4 },
    { siteId: 's1-2', siteName: 'Commercial Bank HQ',     client: 'Commercial Bank of Ceylon', location: 'Union Place, Colombo 02',      dailyCap: 1, weeklyCap: 1, monthlyTarget: 2 },
    { siteId: 's1-3', siteName: 'Arpico Supercentre',     client: 'Arpico Retail Ltd',         location: 'Borella, Colombo 08',          dailyCap: 1, weeklyCap: 2, monthlyTarget: 4 },
    { siteId: 's1-4', siteName: 'BOC Borella Branch',     client: 'Bank of Ceylon',            location: 'Borella, Colombo 08',          dailyCap: 1, weeklyCap: 1, monthlyTarget: 2 },
    { siteId: 's1-5', siteName: 'Dialog Axiata HQ',       client: 'Dialog Axiata PLC',         location: 'Thimbirigasyaya Rd, Col 05',   dailyCap: 1, weeklyCap: 1, monthlyTarget: 3 },
  ],
  'SM-002': [
    { siteId: 's2-1', siteName: 'Shalom Residence',       client: 'Shalom Pvt Ltd',            location: 'Bambalapitiya, Colombo 04',    dailyCap: 1, weeklyCap: 1, monthlyTarget: 3 },
    { siteId: 's2-2', siteName: 'Keells Super Dehiwala',  client: 'John Keells Holdings',      location: 'Dehiwala',                     dailyCap: 1, weeklyCap: 2, monthlyTarget: 4 },
    { siteId: 's2-3', siteName: 'Malay Embassy',          client: 'Ministry of Foreign Affairs', location: 'Jawatte Rd, Colombo 05',    dailyCap: 1, weeklyCap: 1, monthlyTarget: 2 },
    { siteId: 's2-4', siteName: 'NDB Parkway',            client: 'NDB Bank PLC',              location: 'Park St, Colombo 02',          dailyCap: 1, weeklyCap: 1, monthlyTarget: 2 },
  ],
  'SM-003': [
    { siteId: 's3-1', siteName: 'HNB Kandy City Centre',  client: 'HNB PLC',                   location: 'Kandy City Centre, Kandy',     dailyCap: 1, weeklyCap: 1, monthlyTarget: 2 },
    { siteId: 's3-2', siteName: 'Cargills Kandy',         client: 'Cargills Ceylon Ltd',       location: 'Kandy',                        dailyCap: 1, weeklyCap: 2, monthlyTarget: 4 },
    { siteId: 's3-3', siteName: 'Kandy Teaching Hospital', client: 'Govt. Health Services',    location: 'Kandy',                        dailyCap: 1, weeklyCap: 1, monthlyTarget: 3 },
  ],
  'SM-004': [
    { siteId: 's4-1', siteName: 'Galle Fort Hotel',       client: 'Galle Fort Hotel Ltd',      location: 'Galle Fort, Galle',           dailyCap: 1, weeklyCap: 1, monthlyTarget: 2 },
    { siteId: 's4-2', siteName: 'Peoples Bank Matara',    client: 'Peoples Bank',              location: 'Matara',                       dailyCap: 1, weeklyCap: 1, monthlyTarget: 2 },
    { siteId: 's4-3', siteName: 'Hambantota Port',        client: 'HIPG',                      location: 'Hambantota',                   dailyCap: 1, weeklyCap: 2, monthlyTarget: 4 },
    { siteId: 's4-4', siteName: 'Ruhuna University',      client: 'Univ. of Ruhuna',           location: 'Matara',                       dailyCap: 1, weeklyCap: 1, monthlyTarget: 2 },
  ],
  'SM-005': [
    { siteId: 's5-1', siteName: 'Kurunegala Teaching Hospital', client: 'Govt. Health Services', location: 'Kurunegala',                dailyCap: 1, weeklyCap: 1, monthlyTarget: 2 },
    { siteId: 's5-2', siteName: 'Browns Kurunegala',      client: 'Browns & Company',          location: 'Kurunegala',                   dailyCap: 1, weeklyCap: 1, monthlyTarget: 2 },
    { siteId: 's5-3', siteName: 'NTB Puttalam',           client: 'Nations Trust Bank',        location: 'Puttalam',                     dailyCap: 1, weeklyCap: 1, monthlyTarget: 2 },
  ],
  'SM-006': [],
};

const DEFAULT_SM_ID = sortSmRosterBySiteCount(SM_ROSTER, INITIAL_SITE_FREQS)[0]?.smId ?? '';

function buildMockVisitLogs(): SMVisitEntry[] {
  const today = new Date();
  function daysAgo(n: number): string {
    const d = new Date(today);
    d.setDate(today.getDate() - n);
    return d.toISOString().split('T')[0];
  }
  const logs: SMVisitEntry[] = [];
  [0,7,14,21,28,35,42,49,56].forEach(d => { logs.push({ siteId:'s1-1', smId:'SM-001', date:daysAgo(d) }); });
  [3,17,31,45,59].forEach(d => { logs.push({ siteId:'s1-2', smId:'SM-001', date:daysAgo(d) }); });
  [1,8,15,22,29,36,43,50,57].forEach(d => { logs.push({ siteId:'s1-3', smId:'SM-001', date:daysAgo(d) }); });
  [5,19,33,47].forEach(d => { logs.push({ siteId:'s1-4', smId:'SM-001', date:daysAgo(d) }); });
  [2,12,22,32,42,52].forEach(d => { logs.push({ siteId:'s1-5', smId:'SM-001', date:daysAgo(d) }); });
  [2,9,16,23,30,37,44,51,58].forEach(d => { logs.push({ siteId:'s2-1', smId:'SM-002', date:daysAgo(d) }); });
  [5,12,26,40,54].forEach(d => { logs.push({ siteId:'s2-2', smId:'SM-002', date:daysAgo(d) }); });
  [10,28,46].forEach(d => { logs.push({ siteId:'s2-3', smId:'SM-002', date:daysAgo(d) }); });
  [8,30,55].forEach(d => { logs.push({ siteId:'s2-4', smId:'SM-002', date:daysAgo(d) }); });
  [4,18,40,58].forEach(d => { logs.push({ siteId:'s3-1', smId:'SM-003', date:daysAgo(d) }); });
  [6,20,34].forEach(d => { logs.push({ siteId:'s3-2', smId:'SM-003', date:daysAgo(d) }); });
  [15,45].forEach(d => { logs.push({ siteId:'s3-3', smId:'SM-003', date:daysAgo(d) }); });
  [1,15,29,43,57].forEach(d => { logs.push({ siteId:'s4-1', smId:'SM-004', date:daysAgo(d) }); });
  [3,17,31,45,59].forEach(d => { logs.push({ siteId:'s4-2', smId:'SM-004', date:daysAgo(d) }); });
  [2,9,16,23,30,37,44,51].forEach(d => { logs.push({ siteId:'s4-3', smId:'SM-004', date:daysAgo(d) }); });
  [6,20,34,50].forEach(d => { logs.push({ siteId:'s4-4', smId:'SM-004', date:daysAgo(d) }); });
  [5,21,40,58].forEach(d => { logs.push({ siteId:'s5-1', smId:'SM-005', date:daysAgo(d) }); });
  [11,30,52].forEach(d => { logs.push({ siteId:'s5-2', smId:'SM-005', date:daysAgo(d) }); });
  [18,42].forEach(d => { logs.push({ siteId:'s5-3', smId:'SM-005', date:daysAgo(d) }); });
  return logs;
}

const MOCK_VISIT_LOGS = buildMockVisitLogs();

/** Matches FM Settings → Sector Manager per-visit rate preview default */
const DEFAULT_SM_VISIT_RATE_LKR = 2000;

function formatLkr(amount: number): string {
  return `LKR ${amount.toLocaleString('en-LK')}`;
}

function monthlyVisitPay(monthlyTarget: number, rate = DEFAULT_SM_VISIT_RATE_LKR): number {
  return monthlyTarget * rate;
}

function totalMonthlyVisitPay(sites: SMSiteFreqRow[], rate = DEFAULT_SM_VISIT_RATE_LKR): number {
  return sites.reduce((sum, s) => sum + monthlyVisitPay(s.monthlyTarget, rate), 0);
}

function totalMonthlyVisits(sites: SMSiteFreqRow[]): number {
  return sites.reduce((sum, s) => sum + s.monthlyTarget, 0);
}

function computeVisitScore(smId: string, windowDays: number, sites: SMSiteFreqRow[], allLogs: SMVisitEntry[]): number {
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
  selectedSmId,
  setSelectedSmId,
  siteFreqs,
  setSiteFreqs,
  drafts,
  setDrafts,
}: {
  selectedSmId: string;
  setSelectedSmId: React.Dispatch<React.SetStateAction<string>>;
  siteFreqs: Record<string, SMSiteFreqRow[]>;
  setSiteFreqs: React.Dispatch<React.SetStateAction<Record<string, SMSiteFreqRow[]>>>;
  drafts: Record<string, SMSiteFreqRow[]>;
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, SMSiteFreqRow[]>>>;
}) {
  const [savedSmId, setSavedSmId] = useState<string | null>(null);

  const sm = SM_ROSTER.find((s) => s.smId === selectedSmId) ?? null;
  const baseSites = siteFreqs[selectedSmId] ?? [];
  const currentRows: SMSiteFreqRow[] = drafts[selectedSmId] ?? baseSites;

  const score7  = sm ? computeVisitScore(sm.smId, 7,  baseSites, MOCK_VISIT_LOGS) : 0;
  const score30 = sm ? computeVisitScore(sm.smId, 30, baseSites, MOCK_VISIT_LOGS) : 0;
  const score60 = sm ? computeVisitScore(sm.smId, 60, baseSites, MOCK_VISIT_LOGS) : 0;

  const monthlyVisitCount = totalMonthlyVisits(currentRows);
  const monthlyVisitEarnings = totalMonthlyVisitPay(currentRows);

  const isDirty = selectedSmId in drafts;

  function updateRow(siteId: string, field: keyof SMSiteFreqRow, raw: string) {
    const val = Math.max(0, parseInt(raw) || 0);
    setDrafts((prev) => {
      const base = prev[selectedSmId] ?? [...baseSites];
      return {
        ...prev,
        [selectedSmId]: base.map((r) => r.siteId === siteId ? { ...r, [field]: val } : r),
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

  const smRosterSorted = sortSmRosterBySiteCount(SM_ROSTER, siteFreqs);

  const totalAssigned = SM_ROSTER.filter((s) => s.sector.trim() !== '').length;
  const totalSites    = Object.values(siteFreqs).reduce((a, v) => a + v.length, 0);
  const sitesNoVisitPlan = Object.values(siteFreqs).reduce(
    (a, v) => a + v.filter((s) => s.dailyCap === 0 && s.weeklyCap === 0 && s.monthlyTarget === 0).length,
    0,
  );

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
          { label: 'Total SMs',       value: String(SM_ROSTER.length), dot: 'bg-indigo-500',  color: 'text-slate-900'   },
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
                    {[
                      { key: 'D', title: 'Max visits per day' },
                      { key: 'W', title: 'Max visits per week' },
                      { key: 'M', title: 'Required per month' },
                    ].map(({ key, title }) => (
                      <div key={key} className="w-14 text-center" title={title}>
                        <p className="text-xs font-black uppercase tracking-widest text-slate-500">{key}</p>
                        <p className="text-[10px] text-slate-400 leading-tight">{key === 'D' ? '/day' : key === 'W' ? '/week' : '/month'}</p>
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
                          Rule: max <span className="font-bold text-slate-600">{row.weeklyCap}</span>/week,{' '}
                          target <span className="font-bold text-slate-600">{row.monthlyTarget}</span>/month
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
                        {(
                          [
                            { field: 'dailyCap',      val: row.dailyCap      },
                            { field: 'weeklyCap',     val: row.weeklyCap     },
                            { field: 'monthlyTarget', val: row.monthlyTarget },
                          ] as { field: keyof SMSiteFreqRow; val: number }[]
                        ).map(({ field, val }) => (
                          <div key={field} className="flex w-14 flex-col items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              max={31}
                              value={val}
                              onChange={(e) => updateRow(row.siteId, field, e.target.value)}
                              className="w-full rounded-lg border border-slate-200 bg-white px-0 py-1.5 text-center text-sm font-black text-slate-800 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 tabular-nums"
                            />
                          </div>
                        ))}
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
              { key: 'D', label: 'Daily cap — max visits on any one day (usually 1)' },
              { key: 'W', label: 'Weekly cap — max visits in any calendar week' },
              { key: 'M', label: 'Monthly target — visits required this month' },
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
  const holidayCalendarIncomplete = true;

  const [selectedSmId, setSelectedSmId] = useState<string>(DEFAULT_SM_ID);
  const [siteFreqs, setSiteFreqs] = useState<Record<string, SMSiteFreqRow[]>>(INITIAL_SITE_FREQS);
  const [drafts, setDrafts] = useState<Record<string, SMSiteFreqRow[]>>({});

  const smHandlerBody = (
    <>
      <p className="mb-6 rounded-xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
        Preview sector managers and visit caps below — live data syncs when site assignments are seeded in Supabase.
      </p>
      <SMHandlerTab
        selectedSmId={selectedSmId}
        setSelectedSmId={setSelectedSmId}
        siteFreqs={siteFreqs}
        setSiteFreqs={setSiteFreqs}
        drafts={drafts}
        setDrafts={setDrafts}
      />
    </>
  );

  if (isOmPortal) {
    return (
      <OmCommandShell
        title="SM visit caps"
        subtitle="Configure daily, weekly, and monthly visit targets per sector manager"
        icon={UserCheck}
        accent="indigo"
        maxWidth="7xl"
      >
        {smHandlerBody}
      </OmCommandShell>
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
