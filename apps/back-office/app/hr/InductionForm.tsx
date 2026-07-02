'use client';

import React, { useActionState, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';

import type { OnboardEmployeeState } from './onboarding-actions';

import {
  findRankPayEntry,
  isRankValidForHrAssignment,
  ranksForHrAssignmentSelect,
  type RankPayEntry,
} from '../../../../packages/rank-pay-matrix';
import { normalizeEpfNo, sanitizeEpfNoInput } from '../../lib/employee-epf';
import { HR_DOCUMENT_TYPES } from '../../../../packages/supabase/employee-hr-documents';
import EmployeeDocumentField from './EmployeeDocumentField';
import { isNicLookupReady } from '../../lib/employee-nic';
import { checkEpfNoAvailable, lookupPriorRecordsByNic, type PriorEmployeeMatch } from './epf-actions';
import { ONBOARDING_BENCH_SITE } from './onboarding-types';
import type { OnboardingGuardSite } from './onboarding-types';
import { mergePendingHrDocumentsIntoFormData, getPendingHrDocument } from '../../lib/hr-document-pending-registry';
import HrRankSelectField, { HR_RANK_ASSIGN_LATER } from './HrRankSelectField';
import HrSectorSelectField from './HrSectorSelectField';
import { getRankPayMatrix } from '../executive/settings/rank-matrix-actions';
import { getInternalWorkLocationsForMnr } from '../executive/settings/internal-work-locations-actions';
import type { InternalWorkLocationsSettings } from '../../lib/internal-work-locations';
import { formatInternalBranchLabel } from '../../lib/internal-work-locations';
import { showHeadOfficeWorkEmailInMnr } from '../../lib/head-office-work-email';

const CORPORATE_GROUPS = [
  { value: 'GUARD', label: 'Guard' },
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
  internalWorkLocations,
  sectorNames = [],
  occupiedSingletonRanks = [],
  editorRole = null,
  mergeContext,
  disabled = false,
}: {
  action: (
    prev: OnboardEmployeeState | null,
    formData: FormData,
  ) => Promise<OnboardEmployeeState>;
  rankMatrix: RankPayEntry[];
  guardSites: OnboardingGuardSite[];
  internalWorkLocations: InternalWorkLocationsSettings;
  sectorNames?: string[];
  /** MD / OD / FM ranks already provisioned with portal work email — hidden from picker. */
  occupiedSingletonRanks?: string[];
  editorRole?: string | null;
  mergeContext?: { tempId: string; nameHint?: string };
  disabled?: boolean;
}) {
  const [selectedGroup, setSelectedGroup] = useState(mergeContext ? 'GUARD' : '');
  const [selectedRank, setSelectedRank] = useState('');
  const [assignedSector, setAssignedSector] = useState('');
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
  const epfCheckSeq = useRef(0);
  const epfVerifiedRef = useRef<{ epf: string; previousEpf: string } | null>(null);
  const [gramaExpiryError, setGramaExpiryError] = useState<string | null>(null);
  const [formState, formAction, isPending] = useActionState(action, null);
  const router = useRouter();
  const [liveRankMatrix, setLiveRankMatrix] = useState(rankMatrix);
  const [liveSectorNames, setLiveSectorNames] = useState(sectorNames);
  const [liveInternalWorkLocations, setLiveInternalWorkLocations] =
    useState(internalWorkLocations);

  useEffect(() => {
    setLiveRankMatrix(rankMatrix);
  }, [rankMatrix]);

  useEffect(() => {
    setLiveInternalWorkLocations(internalWorkLocations);
  }, [internalWorkLocations]);

  useEffect(() => {
    const reloadDeskData = () => {
      if (document.visibilityState !== 'visible') return;
      getRankPayMatrix()
        .then(setLiveRankMatrix)
        .catch(() => {});
      getInternalWorkLocationsForMnr()
        .then(setLiveInternalWorkLocations)
        .catch(() => {});
    };
    window.addEventListener('focus', reloadDeskData);
    document.addEventListener('visibilitychange', reloadDeskData);
    return () => {
      window.removeEventListener('focus', reloadDeskData);
      document.removeEventListener('visibilitychange', reloadDeskData);
    };
  }, []);

  useEffect(() => {
    setLiveSectorNames(sectorNames);
  }, [sectorNames]);

  const rankOptions = useMemo(() => {
    if (!selectedGroup) return [];
    return ranksForHrAssignmentSelect(liveRankMatrix, selectedGroup, {
      excludeRankCodes: occupiedSingletonRanks,
    });
  }, [liveRankMatrix, selectedGroup, occupiedSingletonRanks]);

  const siteOptions = useMemo(() => {
    const names = guardSites.map((s) => s.siteName);
    return [ONBOARDING_BENCH_SITE, ...names.filter((n) => n !== ONBOARDING_BENCH_SITE)];
  }, [guardSites]);

  const autoRank = useMemo(() => {
    if (!selectedGroup) return '';
    return rankOptions.length === 1 ? rankOptions[0].rankCode : '';
  }, [selectedGroup, rankOptions]);
  const rankLocked = Boolean(selectedGroup && autoRank);
  const effectiveRank =
    rankLocked ? autoRank : selectedRank === HR_RANK_ASSIGN_LATER ? '' : selectedRank;
  const isGuard = selectedGroup === 'GUARD';
  const isCafe = selectedGroup === 'CAFE';
  const isHeadOffice = selectedGroup === 'HEAD_OFFICE';
  const isSmRank = effectiveRank.trim().toUpperCase() === 'SM';
  const internalBranchApplicable = (isCafe || isHeadOffice) && !isSmRank;
  const internalBranchOptions = (isCafe
    ? liveInternalWorkLocations.cafe
    : isHeadOffice
      ? liveInternalWorkLocations.headOffice
      : []
  ).map((loc) => ({
    id: loc.id,
    name: formatInternalBranchLabel(loc.name),
  })).filter((loc) => loc.name.length > 0);
  const internalBranchLabel = isCafe ? 'Café Branch' : 'Head Office Branch';
  const showWorkEmail = showHeadOfficeWorkEmailInMnr({
    group: selectedGroup,
    rank: effectiveRank,
  });
  const rankEntry = useMemo(
    () => findRankPayEntry(liveRankMatrix, effectiveRank),
    [liveRankMatrix, effectiveRank],
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
    setAssignedSector('');
    if (selectedGroup === 'GUARD') {
      setAssignedSite((prev) => prev || ONBOARDING_BENCH_SITE);
    } else {
      setAssignedSite('');
    }
  }, [selectedGroup]);

  useEffect(() => {
    if (!isSmRank) setAssignedSector('');
  }, [isSmRank]);

  useEffect(() => {
    if (!selectedRank || selectedRank === HR_RANK_ASSIGN_LATER || !selectedGroup) return;
    if (
      !isRankValidForHrAssignment(liveRankMatrix, selectedGroup, selectedRank, {
        excludeRankCodes: occupiedSingletonRanks,
      })
    ) {
      setSelectedRank('');
    }
  }, [selectedGroup, selectedRank, liveRankMatrix, occupiedSingletonRanks]);

  useEffect(() => {
    if (autoRank) setSelectedRank(autoRank);
  }, [autoRank]);

  useEffect(() => {
    const target = formState?.redirectTo;
    if (!target) return;
    router.replace(target);
  }, [formState?.redirectTo, router]);

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

  const resolveEpfLocalConflict = useCallback(
    (epf: string, previousEpf: string) => {
      const trimmed = epf.trim();
      if (!trimmed) {
        return { blocked: false as const, message: null };
      }
      if (previousEpf && normalizeEpfNo(trimmed) === normalizeEpfNo(previousEpf)) {
        return {
          blocked: true as const,
          message: 'New EPF must differ from the previous EPF number.',
        };
      }
      return { blocked: false as const, message: null };
    },
    [],
  );

  const verifyEpfAvailable = useCallback(
    async (epf: string, previousEpf: string) => {
      const trimmed = epf.trim();
      const local = resolveEpfLocalConflict(trimmed, previousEpf);
      if (!trimmed) {
        epfVerifiedRef.current = null;
        setEpfUnavailable(null);
        return;
      }
      if (local.blocked) {
        epfVerifiedRef.current = null;
        setEpfUnavailable(local.message);
        return;
      }

      const normEpf = normalizeEpfNo(trimmed);
      const normPrevious = normalizeEpfNo(previousEpf);
      if (
        epfVerifiedRef.current?.epf === normEpf &&
        epfVerifiedRef.current.previousEpf === normPrevious
      ) {
        setEpfUnavailable(null);
        return;
      }

      const seq = ++epfCheckSeq.current;
      setEpfCheckLoading(true);
      try {
        const result = await checkEpfNoAvailable(trimmed);
        if (seq !== epfCheckSeq.current) return;
        if (result.available) {
          epfVerifiedRef.current = { epf: normEpf, previousEpf: normPrevious };
          setEpfUnavailable(null);
        } else {
          epfVerifiedRef.current = null;
          setEpfUnavailable(
            result.usedBy
              ? `Already in use by ${result.usedBy}. EPF numbers are never reused.`
              : 'EPF number is already in use.',
          );
        }
      } catch {
        if (seq !== epfCheckSeq.current) return;
        epfVerifiedRef.current = null;
        setEpfUnavailable(null);
      } finally {
        if (seq === epfCheckSeq.current) {
          setEpfCheckLoading(false);
        }
      }
    },
    [resolveEpfLocalConflict],
  );

  useEffect(() => {
    const trimmed = epfValue.trim();
    if (!trimmed) {
      epfVerifiedRef.current = null;
      setEpfUnavailable(null);
      return;
    }

    const local = resolveEpfLocalConflict(trimmed, previousEpfNo);
    if (local.blocked) {
      epfVerifiedRef.current = null;
      setEpfUnavailable(local.message);
      return;
    }

    const normEpf = normalizeEpfNo(trimmed);
    const normPrevious = normalizeEpfNo(previousEpfNo);
    if (
      epfVerifiedRef.current?.epf === normEpf &&
      epfVerifiedRef.current.previousEpf === normPrevious
    ) {
      setEpfUnavailable(null);
      return;
    }

    const timer = window.setTimeout(() => {
      void verifyEpfAvailable(trimmed, previousEpfNo);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [epfValue, previousEpfNo, resolveEpfLocalConflict, verifyEpfAvailable]);

  const epfBlocksSubmit = Boolean(epfUnavailable) || epfCheckLoading;

  /** Guard / Café need a rank; Head Office may defer rank to MD Portal Staff Command Center. */
  const rankRequirementMet = isHeadOffice || Boolean(effectiveRank.trim());

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      epfBlocksSubmit ||
      disabled ||
      isPending ||
      !selectedGroup ||
      !rankRequirementMet ||
      (isSmRank && !assignedSector.trim())
    ) {
      return;
    }
    const gramaDoc = getPendingHrDocument('grama_niladari');
    const gramaExpiry = (event.currentTarget.elements.namedItem('grama_niladari_expiry') as HTMLInputElement | null)?.value?.trim() ?? '';
    if (gramaDoc && gramaDoc.size > 0 && !gramaExpiry) {
      setGramaExpiryError('Grama Niladari expiry date is required when a certificate scan is attached.');
      return;
    }
    setGramaExpiryError(null);
    const formData = new FormData(event.currentTarget);
    mergePendingHrDocumentsIntoFormData(formData);
    formAction(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="p-8 space-y-10">
      {liveRankMatrix.length === 0 ? (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900"
        >
          No ranks in MD Settings — configure Rank Pay Matrix under Executive Settings before
          assigning ranks.
        </div>
      ) : null}
      {formState?.error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800"
        >
          {formState.error}
        </div>
      )}
      {formState?.warning && (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900"
        >
          {formState.warning}
        </div>
      )}
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
              New EPF No{isSmRank ? ' *' : ''}
            </label>
            {isSmRank && (
              <p className="mb-2 text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                Required for Sector Managers — this number is the SM portal login ID.
              </p>
            )}
            <div className="relative">
              <input
                type="text"
                name="epf_no"
                value={epfValue}
                required={isSmRank}
                onChange={(e) => {
                  epfVerifiedRef.current = null;
                  setEpfValue(sanitizeEpfNoInput(e.target.value));
                }}
                placeholder={isSmRank ? 'SM portal login ID (EPF number)' : 'New EPF membership number'}
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
              Assigned Rank{isHeadOffice ? ' (optional)' : ' *'}
            </label>
            {rankLocked ? (
              <>
                <select
                  required
                  value={effectiveRank}
                  disabled
                  className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-blue-500 outline-none uppercase appearance-none opacity-60"
                >
                  <option value={autoRank}>
                    {rankOptions.find((r) => r.rankCode === autoRank)?.fullTitle
                      ? `${autoRank} — ${rankOptions.find((r) => r.rankCode === autoRank)?.fullTitle}`
                      : autoRank}
                  </option>
                </select>
                <input type="hidden" name="rank" value={autoRank} />
              </>
            ) : (
              <HrRankSelectField
                name="rank"
                corporateGroup={selectedGroup}
                rankMatrix={liveRankMatrix}
                onRankMatrixUpdated={setLiveRankMatrix}
                occupiedSingletonRanks={occupiedSingletonRanks}
                value={selectedRank}
                onChange={setSelectedRank}
                disabled={!selectedGroup}
                required={!isHeadOffice}
                allowAssignLater={isHeadOffice}
                selectClassName={`w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-blue-500 outline-none uppercase appearance-none ${
                  !selectedGroup ? 'opacity-60' : ''
                }`}
              />
            )}
            {isHeadOffice && !rankLocked ? (
              <p className="mt-1.5 text-[10px] font-semibold text-slate-500">
                Choose <strong>Assign later</strong> for FM / MD / OD (set in MD Portal → Security
                &amp; Access → Staff Command Center). Drivers and caretakers can skip rank and work
                email here.
              </p>
            ) : null}
          </div>
          {showWorkEmail ? (
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
                Work Email (optional)
              </label>
              <input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="name@company.com"
                className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <p className="mt-1.5 text-[10px] font-semibold text-slate-500">
                Optional for non-portal HO staff (e.g. driver, caretaker). Portal ranks (FM, HR, OM,
                etc.) need work email in MNR; OTP and module access are issued in MD Portal →
                Security &amp; Access → Staff Command Center.
              </p>
            </div>
          ) : null}
          {isSmRank && (
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
                Assigned Sector *
              </label>
              <HrSectorSelectField
                name="assigned_sector"
                sectorNames={liveSectorNames}
                onSectorNamesUpdated={setLiveSectorNames}
                value={assignedSector}
                onChange={setAssignedSector}
                selectClassName="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-blue-500 outline-none uppercase appearance-none"
              />
            </div>
          )}
          {isSmRank && (
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
                Employee No / Portal Login ID *
              </label>
              {epfValue.trim() ? (
                <input type="hidden" name="emp_number" value={epfValue.trim()} />
              ) : null}
              <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-mono text-slate-700 uppercase">
                {epfValue.trim() || 'Enter New EPF No in Section 1 above'}
              </div>
              <p className="mt-1.5 text-[10px] font-semibold text-amber-800">
                Mirrors New EPF No — used for SM portal login. Access is provisioned automatically on
                induction.
              </p>
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              {isGuard
                ? 'Assigned Site'
                : internalBranchApplicable
                  ? `${internalBranchLabel}${internalBranchOptions.length ? ' *' : ''}`
                  : 'Assigned Site (guards only)'}
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
            ) : internalBranchApplicable ? (
              <>
                {internalBranchOptions.length === 0 ? (
                  <div className="w-full rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                    No branches configured yet. Add GPS branches in MD Settings → Operations, save,
                    then return here.
                  </div>
                ) : (
                  <select
                    name="assigned_site"
                    required
                    value={formatInternalBranchLabel(assignedSite)}
                    onChange={(e) => setAssignedSite(formatInternalBranchLabel(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-blue-500 outline-none uppercase appearance-none"
                  >
                    <option value="">
                      Select branch…
                    </option>
                    {internalBranchOptions.map((loc) => (
                      <option key={loc.id} value={loc.name}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                )}
                <p className="mt-1.5 text-[10px] font-semibold text-slate-500">
                  Branches are defined in MD Settings → Operations. Café roster and check-in use this
                  assignment.
                </p>
              </>
            ) : (
              <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-400 uppercase">
                {selectedGroup
                  ? 'Site assignment applies to field guards only'
                  : 'Select corporate group to assign a site or branch'}
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
              Basic Salary (B) — LKR
            </label>
            <input
              type="number"
              name="base_salary"
              min={0}
              step={1}
              value={baseSalary}
              onChange={(e) => setBaseSalary(e.target.value)}
              placeholder={rankEntry?.basicPay ? String(rankEntry.basicPay) : '45000'}
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
            Fixed Monthly Allowances (LKR)
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {(
              [
                ['fixed_allowance_lkr', 'Fixed Allowance'],
                ['special_allowance_lkr', 'Special Allowance'],
                ['site_allowance_lkr', 'Site Allowance'],
                ['meal_allowance_lkr', 'Meal Allowance'],
                ['transport_allowance_lkr', 'Transport Allowance'],
              ] as const
            ).map(([name, label]) => (
              <div key={name}>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
                  {label}
                </label>
                <input
                  type="number"
                  name={name}
                  min={0}
                  step={1}
                  defaultValue={0}
                  placeholder="0"
                  className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-rose-700">
            Fixed Monthly Deduction (LKR)
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
                Fixed Deduction
              </label>
              <input
                type="number"
                name="fixed_deduction_lkr"
                min={0}
                step={1}
                defaultValue={0}
                placeholder="0"
                className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-rose-500 outline-none"
              />
              <p className="mt-1.5 text-[10px] font-semibold text-slate-500">
                Recurring payroll deduction each month (e.g. society, levy). FM applies automatically.
              </p>
            </div>
          </div>
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
        </div>

        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
          Document scans are optional at induction — can be completed later in MNR.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {HR_DOCUMENT_TYPES.filter((docType) => docType !== 'nic_passport').map((docType) => (
            <React.Fragment key={docType}>
              <EmployeeDocumentField
                employeeId=""
                docType={docType}
                inductionMode
                canUpload
              />
              {docType === 'grama_niladari' && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
                    Grama Niladari Expiry
                    <span className="text-slate-400 font-semibold normal-case tracking-normal ml-1">
                      (required if certificate uploaded)
                    </span>
                  </label>
                  <input
                    type="date"
                    name="grama_niladari_expiry"
                    className={`w-full bg-white border rounded-lg px-4 py-3 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-amber-500 outline-none ${
                      gramaExpiryError ? 'border-red-400 ring-2 ring-red-100' : 'border-slate-300'
                    }`}
                    onChange={() => setGramaExpiryError(null)}
                  />
                  {gramaExpiryError && (
                    <p className="mt-1.5 text-[11px] font-bold text-red-700">{gramaExpiryError}</p>
                  )}
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="pt-4 space-y-2">
        {epfBlocksSubmit && (
          <p className="text-[11px] font-bold text-red-700 text-center">
            {epfCheckLoading
              ? 'Checking EPF availability…'
              : 'Resolve the EPF issue above before submitting.'}
          </p>
        )}
        <button
          type="submit"
          disabled={
            disabled ||
            isPending ||
            !selectedGroup ||
            !rankRequirementMet ||
            epfBlocksSubmit ||
            (isSmRank && !assignedSector.trim())
          }
          className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-rose-600 to-fuchsia-700 hover:from-rose-500 hover:to-fuchsia-600 text-white font-black py-4 rounded-xl uppercase tracking-widest text-sm transition-all shadow-lg hover:shadow-rose-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" /> Processing…
            </>
          ) : (
            <>
              <ShieldCheck className="w-5 h-5" /> Initiate Secure Onboarding
            </>
          )}
        </button>
      </div>
    </form>
  );
}
