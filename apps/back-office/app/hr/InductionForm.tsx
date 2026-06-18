'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';

import {
  findRankPayEntry,
  isRankValidForCorporateGroup,
  ranksForCorporateGroup,
  type RankPayEntry,
} from '../../../../packages/rank-pay-matrix';
import { filterRanksForEditor } from '../../lib/executive-rank-guard';
import { normalizeEpfNo, sanitizeEpfNoInput } from '../../lib/employee-epf';
import { HR_DOCUMENT_TYPES } from '../../../../packages/supabase/employee-hr-documents';
import EmployeeDocumentField from './EmployeeDocumentField';
import { isNicLookupReady } from '../../lib/employee-nic';
import { checkEpfNoAvailable, lookupPriorRecordsByNic, type PriorEmployeeMatch } from './epf-actions';
import { ONBOARDING_BENCH_SITE } from './onboarding-types';
import type { OnboardingGuardSite } from './onboarding-types';

const CORPORATE_GROUPS = [
  { value: 'GUARD', label: 'Guard' },
  { value: 'SECTOR_MANAGER', label: 'Sector Manager' },
  { value: 'HEAD_OFFICE', label: 'Head Office' },
  { value: 'CAFE', label: 'Café' },
] as const;

const RELIGION_OPTIONS = [
  { value: 'BUDDHIST', label: 'Buddhist' },
  { value: 'CHRISTIAN', label: 'Christian' },
  { value: 'ROMAN CATHOLIC', label: 'Roman Catholic' },
  { value: 'MUSLIM', label: 'Muslim' },
  { value: 'HINDU', label: 'Hindu' },
  { value: 'ATHEIST', label: 'Atheist' },
  { value: 'OTHER', label: 'Other' },
] as const;

export default function InductionForm({
  action,
  rankMatrix,
  guardSites,
  editorRole = null,
  canManageExecutive = false,
  mergeContext,
}: {
  action: (formData: FormData) => Promise<void>;
  rankMatrix: RankPayEntry[];
  guardSites: OnboardingGuardSite[];
  editorRole?: string | null;
  canManageExecutive?: boolean;
  mergeContext?: { tempId: string; nameHint?: string };
}) {
  const [selectedGroup, setSelectedGroup] = useState(mergeContext ? 'GUARD' : '');
  const [selectedRank, setSelectedRank] = useState('');
  const [assignedSite, setAssignedSite] = useState(ONBOARDING_BENCH_SITE);
  const [salaryType, setSalaryType] = useState('BANK');
  const [baseSalary, setBaseSalary] = useState('');
  const [nicValue, setNicValue] = useState('');
  const [epfValue, setEpfValue] = useState('');
  const [previousEpfNo, setPreviousEpfNo] = useState('');
  const [priorMatches, setPriorMatches] = useState<PriorEmployeeMatch[]>([]);
  const [nicLookupLoading, setNicLookupLoading] = useState(false);
  const [nicLookupError, setNicLookupError] = useState<string | null>(null);
  const [epfCheckLoading, setEpfCheckLoading] = useState(false);
  const [epfUnavailable, setEpfUnavailable] = useState<string | null>(null);

  const selectableRanks = useMemo(
    () => filterRanksForEditor(rankMatrix, editorRole),
    [rankMatrix, editorRole],
  );

  const rankOptions = useMemo(() => {
    if (!selectedGroup) return [];
    return ranksForCorporateGroup(selectableRanks, selectedGroup);
  }, [selectableRanks, selectedGroup]);

  const siteOptions = useMemo(() => {
    const names = guardSites.map((s) => s.siteName);
    return [ONBOARDING_BENCH_SITE, ...names.filter((n) => n !== ONBOARDING_BENCH_SITE)];
  }, [guardSites]);

  const autoRank = useMemo(() => {
    if (!selectedGroup) return '';
    if (selectedGroup === 'SECTOR_MANAGER') {
      const sm = rankOptions.find((r) => r.rankCode === 'SM');
      if (sm) return sm.rankCode;
    }
    return rankOptions.length === 1 ? rankOptions[0].rankCode : '';
  }, [selectedGroup, rankOptions]);
  const rankLocked = Boolean(selectedGroup && autoRank);
  const effectiveRank = rankLocked ? autoRank : selectedRank;
  const isGuard = selectedGroup === 'GUARD';
  const isSm = selectedGroup === 'SECTOR_MANAGER';
  const rankEntry = useMemo(
    () => findRankPayEntry(rankMatrix, effectiveRank),
    [rankMatrix, effectiveRank],
  );

  useEffect(() => {
    if (!rankEntry) {
      setBaseSalary('');
      return;
    }
    setBaseSalary(rankEntry.basicPay > 0 ? String(rankEntry.basicPay) : '');
    setSalaryType(rankEntry.salaryType);
  }, [rankEntry]);

  useEffect(() => {
    setSelectedRank('');
    if (selectedGroup === 'GUARD') {
      setAssignedSite((prev) => prev || ONBOARDING_BENCH_SITE);
    } else {
      setAssignedSite('');
    }
  }, [selectedGroup]);

  useEffect(() => {
    if (!selectedRank || !selectedGroup) return;
    if (!isRankValidForCorporateGroup(rankMatrix, selectedGroup, selectedRank)) {
      setSelectedRank('');
    }
  }, [selectedGroup, selectedRank, rankMatrix]);

  useEffect(() => {
    if (autoRank) setSelectedRank(autoRank);
  }, [autoRank]);

  const lookupNicHistory = useCallback(async (nic: string) => {
    const trimmed = nic.trim();
    if (!isNicLookupReady(trimmed)) {
      setPriorMatches([]);
      setPreviousEpfNo('');
      setNicLookupError(null);
      return;
    }
    setNicLookupLoading(true);
    setNicLookupError(null);
    try {
      const { matches } = await lookupPriorRecordsByNic(trimmed);
      setPriorMatches(matches);
      setPreviousEpfNo(normalizeEpfNo(matches[0]?.epfNo ?? ''));
    } catch {
      setPriorMatches([]);
      setPreviousEpfNo('');
      setNicLookupError('Could not search prior records for this NIC. Try again or contact IT.');
    } finally {
      setNicLookupLoading(false);
    }
  }, []);

  useEffect(() => {
    const trimmed = nicValue.trim();
    if (!isNicLookupReady(trimmed)) {
      setPriorMatches([]);
      setPreviousEpfNo('');
      setNicLookupError(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void lookupNicHistory(trimmed);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [nicValue, lookupNicHistory]);

  const verifyEpfAvailable = useCallback(async (epf: string) => {
    const trimmed = epf.trim();
    if (!trimmed) {
      setEpfUnavailable(null);
      return;
    }
    if (previousEpfNo && normalizeEpfNo(trimmed) === normalizeEpfNo(previousEpfNo)) {
      setEpfUnavailable('New EPF must differ from the previous EPF number.');
      return;
    }
    setEpfCheckLoading(true);
    try {
      const result = await checkEpfNoAvailable(trimmed);
      if (result.available) {
        setEpfUnavailable(null);
      } else {
        setEpfUnavailable(
          result.usedBy
            ? `Already in use by ${result.usedBy}. EPF numbers are never reused.`
            : 'EPF number is already in use.',
        );
      }
    } catch {
      setEpfUnavailable(null);
    } finally {
      setEpfCheckLoading(false);
    }
  }, [previousEpfNo]);

  useEffect(() => {
    if (epfValue.trim()) {
      void verifyEpfAvailable(epfValue);
    } else {
      setEpfUnavailable(null);
    }
  }, [epfValue, previousEpfNo, verifyEpfAvailable]);

  return (
    <form action={action} encType="multipart/form-data" className="p-8 space-y-10">
      {mergeContext && <input type="hidden" name="temp_emp_id" value={mergeContext.tempId} />}
      {/* ── Section 1: Identity & Demographics ── */}
      <div className="space-y-5">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-rose-50 text-rose-700 text-sm font-black border border-rose-200">
            1
          </span>
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">
            Section 1 — Identity & Demographics
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="md:col-span-1">
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              Full Legal Name *
            </label>
            <input
              type="text"
              name="full_name"
              required
              defaultValue={mergeContext?.nameHint?.toUpperCase()}
              placeholder="e.g. PATHIRANA K.R.S."
              className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono placeholder:text-slate-400 focus:ring-2 focus:ring-rose-500 outline-none uppercase"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              NIC Number *
            </label>
            <div className="relative">
              <input
                type="text"
                name="nic"
                required
                value={nicValue}
                onChange={(e) => setNicValue(e.target.value.toUpperCase())}
                onBlur={() => void lookupNicHistory(nicValue)}
                placeholder="199412345678"
                className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono placeholder:text-slate-400 focus:ring-2 focus:ring-rose-500 outline-none uppercase"
              />
              {nicLookupLoading ? (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
              ) : null}
            </div>
            {nicLookupError ? (
              <p className="mt-1 flex items-start gap-1 text-[11px] font-bold text-red-600">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                {nicLookupError}
              </p>
            ) : null}
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              Phone Number *
            </label>
            <input
              type="tel"
              name="phone"
              required
              placeholder="+94 77 000 0000"
              className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono placeholder:text-slate-400 focus:ring-2 focus:ring-rose-500 outline-none"
            />
          </div>
        </div>

        {priorMatches.length > 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 space-y-2">
            <p className="text-xs font-black uppercase tracking-wide text-amber-900">
              Prior employment record{priorMatches.length > 1 ? 's' : ''} found for this NIC
            </p>
            <ul className="space-y-2">
              {priorMatches.map((match) => (
                <li
                  key={match.id}
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    match.isBlacklisted
                      ? 'border-red-300 bg-red-50'
                      : 'border-amber-200 bg-white/80'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-900">{match.fullName}</span>
                    <span className="text-slate-500">·</span>
                    <span className="font-mono text-slate-600">EPF {match.epfNo || '—'}</span>
                    <span className="text-slate-500">·</span>
                    <span className="uppercase text-slate-600">{match.status || 'Unknown'}</span>
                  </div>
                  {match.isBlacklisted ? (
                    <p className="mt-1 flex items-center gap-1 font-bold text-red-700">
                      <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                      Blacklisted{match.blacklistReason ? `: ${match.blacklistReason}` : ''}
                    </p>
                  ) : null}
                  {match.guardRating != null ? (
                    <p className="mt-1 text-slate-600">
                      Guard score: {match.guardRating.toFixed(1)}
                      {match.guardTier ? ` (${match.guardTier})` : ''}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="text-[11px] font-bold text-amber-900">
              Assign a new EPF number below. Prior EPF numbers above are stored for audit and payroll
              history.
            </p>
            <input type="hidden" name="previous_epf_no" value={previousEpfNo} />
          </div>
        ) : null}

        <div
          className={`grid grid-cols-1 gap-5 ${priorMatches.length > 0 ? '' : 'md:grid-cols-2'}`}
        >
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              Passport No
            </label>
            <input
              type="text"
              name="passport_no"
              placeholder="N1234567"
              className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono placeholder:text-slate-400 focus:ring-2 focus:ring-rose-500 outline-none uppercase"
            />
          </div>
          {priorMatches.length === 0 ? (
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
                Previous EPF No
              </label>
              <input
                type="text"
                name="previous_epf_no"
                value={previousEpfNo}
                readOnly
                placeholder="Auto-filled when NIC matches a prior record"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-700 font-mono placeholder:text-slate-400 outline-none"
              />
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              New EPF No
            </label>
            <div className="relative">
              <input
                type="text"
                name="epf_no"
                value={epfValue}
                onChange={(e) => setEpfValue(sanitizeEpfNoInput(e.target.value))}
                onBlur={() => void verifyEpfAvailable(epfValue)}
                placeholder="New EPF membership number"
                className={`w-full bg-white border rounded-lg px-4 py-3 text-sm text-slate-900 font-mono placeholder:text-slate-400 focus:ring-2 outline-none ${
                  epfUnavailable
                    ? 'border-red-300 focus:ring-red-400'
                    : 'border-slate-300 focus:ring-rose-500'
                }`}
              />
              {epfCheckLoading ? (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
              ) : null}
            </div>
            {epfUnavailable ? (
              <p className="mt-1 flex items-start gap-1 text-[11px] font-bold text-red-600">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                {epfUnavailable}
              </p>
            ) : (
              <p className="mt-1 text-[10px] text-slate-500 font-bold">
                EPF numbers are unique forever — never reuse a resigned employee&apos;s number.
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              Date of Birth
            </label>
            <input
              type="date"
              name="dob"
              className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-rose-500 outline-none "
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              Gender
            </label>
            <select
              name="gender"
              className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-rose-500 outline-none uppercase appearance-none"
            >
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              Nationality
            </label>
            <input
              type="text"
              name="nationality"
              defaultValue="SRI LANKAN"
              className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-rose-500 outline-none uppercase"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              Religion
            </label>
            <select
              name="religion"
              defaultValue=""
              className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-rose-500 outline-none uppercase appearance-none"
            >
              <option value="">Select religion…</option>
              {RELIGION_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
            Home Address
          </label>
          <textarea
            name="home_address"
            rows={2}
            placeholder="Full residential address"
            className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-rose-500 outline-none uppercase"
          />
        </div>
      </div>

      {/* ── Section 2: Deployment ── */}
      <div className="space-y-5">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-50 text-blue-700 text-sm font-black border border-blue-200">
            2
          </span>
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">
            Section 2 — Deployment
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              Corporate Group *
            </label>
            <select
              name="corporate_group"
              required
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-blue-500 outline-none uppercase appearance-none"
            >
              <option value="" disabled>
                -- SELECT --
              </option>
              {CORPORATE_GROUPS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              Assigned Rank *
            </label>
            <select
              {...(rankLocked ? {} : { name: 'rank' })}
              required
              value={effectiveRank}
              onChange={(e) => setSelectedRank(e.target.value)}
              disabled={!selectedGroup || rankLocked}
              className={`w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-blue-500 outline-none uppercase appearance-none ${
                !selectedGroup || rankLocked ? 'opacity-60' : ''
              }`}
            >
              <option value="" disabled>
                {selectedGroup ? 'Select rank…' : 'Select corporate group first'}
              </option>
              {rankOptions.map((r) => (
                <option key={r.id} value={r.rankCode}>
                  {r.rankCode} — {r.fullTitle}
                </option>
              ))}
            </select>
            {rankLocked && <input type="hidden" name="rank" value={autoRank} />}
            {selectedGroup && rankOptions.length === 0 && (
              <p className="mt-2 text-[10px] font-bold text-amber-800">
                No ranks for{' '}
                {CORPORATE_GROUPS.find((g) => g.value === selectedGroup)?.label ?? selectedGroup} in
                MD Settings → Rank Pay Matrix. Add ranks with the matching operational group, then
                save the matrix.
              </p>
            )}
            {selectedGroup && rankOptions.length > 0 && (
              <p className="mt-1.5 text-[10px] font-semibold text-slate-500">
                Only ranks tagged for this corporate group in the pay matrix are listed.
              </p>
            )}
            {!canManageExecutive && selectedGroup && (
              <p className="mt-1.5 text-[10px] font-bold text-indigo-800">
                MD and OD ranks are hidden — only MD or OD can assign executive portal access.
              </p>
            )}
          </div>
          {isSm && (
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
                Employee No / Portal Login ID *
              </label>
              <input
                type="text"
                name="emp_number"
                required
                value={epfValue}
                readOnly
                placeholder="Auto-filled from New EPF No"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-700 font-mono placeholder:text-slate-400 outline-none uppercase"
              />
              <p className="mt-1.5 text-[10px] font-semibold text-amber-800">
                Matches the new EPF number — used for SM portal login. Access is provisioned
                automatically on induction.
              </p>
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              Assigned Site{isGuard ? '' : ' (guards only)'}
            </label>
            {isGuard ? (
              <select
                name="assigned_site"
                required
                value={assignedSite}
                onChange={(e) => setAssignedSite(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-blue-500 outline-none uppercase appearance-none"
              >
                {siteOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            ) : (
              <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-400 uppercase">
                {selectedGroup
                  ? 'Site assignment applies to field guards only'
                  : 'Select Guard as corporate group to assign a site'}
              </div>
            )}
            {isGuard && guardSites.length === 0 && (
              <p className="mt-2 text-[10px] font-bold text-amber-800">
                No active client sites in the site directory yet. You can bench the guard or add sites
                in Executive → Sites first.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 3: Finance & Payroll ── */}
      <div className="space-y-5">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-emerald-50 text-emerald-700 text-sm font-black border border-emerald-200">
            3
          </span>
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">
            Section 3 — Finance & Payroll
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          <div className="md:col-span-1">
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              Payment Route
            </label>
            <select
              name="salary_type"
              value={salaryType}
              onChange={(e) => setSalaryType(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-emerald-500 outline-none uppercase appearance-none"
            >
              <option value="BANK">Bank Transfer</option>
              <option value="CASH">Cash Allocation</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              Base Salary (LKR)
            </label>
            <input
              type="number"
              name="base_salary"
              min={0}
              step={1}
              value={baseSalary}
              onChange={(e) => setBaseSalary(e.target.value)}
              placeholder={rankEntry?.basicPay ? String(rankEntry.basicPay) : '45000.00'}
              className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
            />
            {rankEntry?.basicPay ? (
              <p className="mt-1.5 text-[10px] font-semibold text-emerald-800">
                Pre-filled from MD Settings → Rank Pay Matrix ({rankEntry.rankCode}). Edit if needed.
              </p>
            ) : null}
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              EPF Applicable?
            </label>
            <select
              name="epf_yn"
              defaultValue="YES"
              className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-emerald-500 outline-none uppercase appearance-none"
            >
              <option value="YES">YES</option>
              <option value="NO">NO</option>
            </select>
          </div>
        </div>

        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-emerald-700">
            Fixed Monthly Allowances
          </p>
          <p className="text-xs text-slate-500">
            Site allowance is set by FM in payroll earnings each month. Arrears and performance
            incentive are added there as well — not at induction.
          </p>
        </div>

        {salaryType === 'BANK' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 p-4 rounded-xl border border-slate-200 bg-slate-50">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
                Bank Code
              </label>
              <input
                type="text"
                name="bank_code"
                placeholder="e.g. 7056 (ComBank)"
                className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-emerald-500 outline-none uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
                Branch Code
              </label>
              <input
                type="text"
                name="branch_code"
                placeholder="e.g. 052"
                className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-emerald-500 outline-none uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
                Account Number
              </label>
              <input
                type="text"
                name="bank_acc"
                placeholder="Account No"
                className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Section 4: ISO Vetting ── */}
      <div className="space-y-5">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-50 text-amber-700 text-sm font-black border border-amber-200">
            4
          </span>
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">
            Section 4 — ISO Vetting
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <EmployeeDocumentField
            employeeId=""
            docType="nic_passport"
            inductionMode
            canUpload
          />
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              Police Clearance Expiry
            </label>
            <input
              type="date"
              name="police_expiry"
              className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-amber-500 outline-none "
            />
          </div>
        </div>

        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
          Document scans are optional at induction — can be completed later in MNR.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {HR_DOCUMENT_TYPES.filter((docType) => docType !== 'nic_passport').map((docType) => (
            <EmployeeDocumentField
              key={docType}
              employeeId=""
              docType={docType}
              inductionMode
              canUpload
            />
          ))}
        </div>
      </div>

      <div className="pt-4">
        <button
          type="submit"
          disabled={!selectedGroup || !effectiveRank}
          className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-rose-600 to-fuchsia-700 hover:from-rose-500 hover:to-fuchsia-600 text-white font-black py-4 rounded-xl uppercase tracking-widest text-sm transition-all shadow-lg hover:shadow-rose-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ShieldCheck className="w-5 h-5" /> Initiate Secure Onboarding
        </button>
      </div>
    </form>
  );
}
