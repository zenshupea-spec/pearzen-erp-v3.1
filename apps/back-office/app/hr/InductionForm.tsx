'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';

import {
  ranksForCorporateGroup,
  type RankPayEntry,
} from '../../../../packages/rank-pay-matrix';
import { filterRanksForEditor } from '../../lib/executive-rank-guard';
import { HR_DOCUMENT_TYPES } from '../../../../packages/supabase/employee-hr-documents';
import EmployeeDocumentField from './EmployeeDocumentField';

const SITES = [
  'Unassigned (Bench)',
  'Lanka Hospitals',
  'Commercial Bank HQ',
  'Cargills HQ',
  'BOC Main Branch',
  'Hemas Holdings',
];

const CORPORATE_GROUPS = [
  { value: 'GUARD', label: 'Guard' },
  { value: 'SECTOR_MANAGER', label: 'Sector Manager' },
  { value: 'HEAD_OFFICE', label: 'Head Office' },
  { value: 'CAFE', label: 'Café' },
] as const;

export default function InductionForm({
  action,
  rankMatrix,
  canManageExecutive = false,
}: {
  action: (formData: FormData) => Promise<void>;
  rankMatrix: RankPayEntry[];
  canManageExecutive?: boolean;
}) {
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedRank, setSelectedRank] = useState('');
  const [assignedSite, setAssignedSite] = useState('Unassigned (Bench)');
  const [salaryType, setSalaryType] = useState('BANK');

  const rankOptions = useMemo(() => {
    const groupRanks = ranksForCorporateGroup(rankMatrix, selectedGroup);
    return canManageExecutive
      ? groupRanks
      : filterRanksForEditor(groupRanks, "HR");
  }, [rankMatrix, selectedGroup, canManageExecutive]);

  const autoRank =
    rankOptions.length === 1 ? rankOptions[0].rankCode : '';
  const rankLocked = Boolean(selectedGroup && autoRank);
  const effectiveRank = rankLocked ? autoRank : selectedRank;
  const isGuard = selectedGroup === 'GUARD';
  const isSm = selectedGroup === 'SECTOR_MANAGER';

  useEffect(() => {
    setSelectedRank('');
    if (selectedGroup === 'GUARD') {
      setAssignedSite((prev) => prev || 'Unassigned (Bench)');
    } else {
      setAssignedSite('');
    }
  }, [selectedGroup]);

  useEffect(() => {
    if (autoRank) setSelectedRank(autoRank);
  }, [autoRank]);

  return (
    <form action={action} encType="multipart/form-data" className="p-8 space-y-10">
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
              placeholder="e.g. PATHIRANA K.R.S."
              className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono placeholder:text-slate-400 focus:ring-2 focus:ring-rose-500 outline-none uppercase"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              NIC Number *
            </label>
            <input
              type="text"
              name="nic"
              required
              placeholder="199412345678"
              className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono placeholder:text-slate-400 focus:ring-2 focus:ring-rose-500 outline-none uppercase"
            />
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              EPF No
            </label>
            <input
              type="text"
              name="epf_no"
              placeholder="EPF membership number"
              className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono placeholder:text-slate-400 focus:ring-2 focus:ring-rose-500 outline-none"
            />
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
            <input
              type="text"
              name="religion"
              placeholder="e.g. BUDDHIST"
              className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-rose-500 outline-none uppercase"
            />
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
                No ranks for this group in MD Settings → Rank Pay Matrix. Add ranks with the matching
                operational group, then save the matrix.
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
                placeholder="e.g. SM-001"
                className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 outline-none uppercase"
              />
              <p className="mt-1.5 text-[10px] font-semibold text-amber-800">
                Used for SM portal login. Portal access is provisioned automatically on induction.
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
                {SITES.map((s) => (
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
              placeholder="45000.00"
              className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
            />
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
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              MoD Expiry Date *
            </label>
            <input
              type="date"
              name="mod_expiry"
              required
              className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-amber-500 outline-none "
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              Police Clearance Expiry *
            </label>
            <input
              type="date"
              name="police_expiry"
              required
              className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-amber-500 outline-none "
            />
          </div>
        </div>

        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
          Upload scans (optional at induction — can be completed later in MNR)
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {HR_DOCUMENT_TYPES.map((docType) => (
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
