'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useCallback } from 'react';

import { appendRankToPayMatrixFromHr } from '../executive/settings/rank-matrix-actions';
import {
  isHrRankSelectableInPicker,
  ranksForHrAssignmentSelect,
  ranksForHrRankPickerOptions,
  type RankPayEntry,
} from '../../../../packages/rank-pay-matrix';

function mdLedgerSectionLabel(corporateGroup: string): string {
  const key = corporateGroup.trim().toUpperCase();
  if (key === 'GUARD') return 'Guards (Field Operations)';
  if (key === 'CAFE') return 'Café Operations';
  if (key === 'HEAD_OFFICE') return 'Head Office (incl. Sector Manager ranks)';
  return 'Rank Pay Matrix';
}

/** HR may defer singleton / executive ranks to MD Portal → Security & Access → Staff Command Center. */
export const HR_RANK_ASSIGN_LATER = '__assign_later__';

export type HrRankSelectFieldProps = {
  name: string;
  corporateGroup: string;
  rankMatrix: RankPayEntry[];
  onRankMatrixUpdated: (matrix: RankPayEntry[]) => void;
  occupiedSingletonRanks?: string[];
  value: string;
  onChange: (rankCode: string) => void;
  disabled?: boolean;
  required?: boolean;
  allowAssignLater?: boolean;
  selectClassName?: string;
};

export default function HrRankSelectField({
  name,
  corporateGroup,
  rankMatrix,
  onRankMatrixUpdated,
  occupiedSingletonRanks = [],
  value,
  onChange,
  disabled = false,
  required = true,
  allowAssignLater = false,
  selectClassName,
}: HrRankSelectFieldProps) {
  const router = useRouter();
  const [addingRank, setAddingRank] = useState(false);
  const [newRankCode, setNewRankCode] = useState('');
  const [newRankTitle, setNewRankTitle] = useState('');
  const [newRankPay, setNewRankPay] = useState('');
  const [addRankError, setAddRankError] = useState('');
  const [addRankSaving, setAddRankSaving] = useState(false);

  const rankOptions = useMemo(
    () =>
      corporateGroup
        ? ranksForHrRankPickerOptions(rankMatrix, corporateGroup)
        : [],
    [rankMatrix, corporateGroup],
  );

  const isRankSelectable = useCallback(
    (rankCode: string) =>
      isHrRankSelectableInPicker(rankMatrix, corporateGroup, rankCode, {
        excludeRankCodes: occupiedSingletonRanks,
      }),
    [rankMatrix, corporateGroup, occupiedSingletonRanks],
  );

  const isGuardGroup = corporateGroup.trim().toUpperCase() === 'GUARD';

  const assignLaterSelected = value === HR_RANK_ASSIGN_LATER;

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    if (next === '__add_rank__') {
      setAddingRank(true);
      setAddRankError('');
      return;
    }
    setAddingRank(false);
    onChange(next);
  };

  const handleAddRank = async () => {
    setAddRankError('');
    setAddRankSaving(true);
    try {
      const result = await appendRankToPayMatrixFromHr({
        rankCode: newRankCode,
        fullTitle: newRankTitle,
        corporateGroup,
        basicPay: newRankPay ? Number.parseInt(newRankPay, 10) : 0,
      });
      if (!result.success) {
        setAddRankError(result.error ?? 'Could not add rank.');
        return;
      }
      const nextMatrix = rankMatrix.some((entry) => entry.rankCode === result.rankCode)
        ? rankMatrix
        : [...rankMatrix, result.entry];
      onRankMatrixUpdated(nextMatrix);
      setAddingRank(false);
      setNewRankCode('');
      setNewRankTitle('');
      setNewRankPay('');
      onChange(result.rankCode);
      router.refresh();
    } catch (err) {
      setAddRankError(err instanceof Error ? err.message : 'Could not add rank.');
    } finally {
      setAddRankSaving(false);
    }
  };

  const inputClass =
    'w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-blue-500 outline-none uppercase';

  return (
    <>
      {assignLaterSelected && !addingRank ? (
        <input type="hidden" name={name} value="" />
      ) : null}
      <select
        name={addingRank || assignLaterSelected ? undefined : name}
        required={required && !addingRank && !allowAssignLater}
        disabled={!corporateGroup || disabled || addingRank}
        value={addingRank ? '' : value}
        onChange={handleSelectChange}
        className={selectClassName}
      >
        <option value="" disabled={required}>
          {corporateGroup
            ? allowAssignLater
              ? 'Select rank or assign later…'
              : 'Select rank…'
            : 'Select corporate group first'}
        </option>
        {allowAssignLater && corporateGroup ? (
          <option value={HR_RANK_ASSIGN_LATER}>
            Assign later (MD Portal → Staff Command Center)
          </option>
        ) : null}
        {rankOptions.map((r) => {
          const selectable = isRankSelectable(r.rankCode);
          return (
            <option key={r.id} value={r.rankCode} disabled={!selectable}>
              {r.rankCode} — {r.fullTitle}
              {!selectable ? ' (not assignable via HR)' : ''}
            </option>
          );
        })}
        {corporateGroup ? (
          <option value="__add_rank__">+ Add new rank to this list…</option>
        ) : null}
      </select>

      {addingRank ? (
        <div className="mt-2 space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-900">
            New rank for {corporateGroup}
          </p>
          <p className="text-[10px] font-semibold text-indigo-800">
            Saved to MD Settings → {mdLedgerSectionLabel(corporateGroup)}.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              type="text"
              value={newRankCode}
              onChange={(e) => setNewRankCode(e.target.value.toUpperCase().slice(0, 12))}
              placeholder="Code (e.g. SSG)"
              maxLength={12}
              className={inputClass}
            />
            <input
              type="text"
              value={newRankTitle}
              onChange={(e) => setNewRankTitle(e.target.value)}
              placeholder="Full title"
              className={inputClass}
            />
          </div>
          {isGuardGroup ? (
            <input
              type="number"
              min={0}
              value={newRankPay}
              onChange={(e) => setNewRankPay(e.target.value)}
              placeholder="Base monthly pay (LKR) — optional"
              className={inputClass}
            />
          ) : null}
          {addRankError ? (
            <p className="text-[10px] font-semibold text-rose-700">{addRankError}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={addRankSaving || !newRankCode.trim() || !newRankTitle.trim()}
              onClick={() => void handleAddRank()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-700 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-50"
            >
              {addRankSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Add to list
            </button>
            <button
              type="button"
              disabled={addRankSaving}
              onClick={() => {
                setAddingRank(false);
                setAddRankError('');
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-bold text-slate-600"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {corporateGroup && rankOptions.length === 0 && !addingRank ? (
        <p className="mt-2 text-[10px] font-bold text-amber-800">
          No ranks in MD Settings for this group — use &ldquo;+ Add new rank&rdquo; or ask MD to
          configure Rank Pay Matrix.
        </p>
      ) : null}
      {corporateGroup && (rankOptions.length > 0 || addingRank) ? (
        <p className="mt-1.5 text-[10px] font-semibold text-slate-500">
          Matches MD Settings pay ledger for this group
          {corporateGroup.trim().toUpperCase() === 'HEAD_OFFICE'
            ? ' (Head Office + Sector Manager sections)'
            : ''}
          . MD / OD / FM singleton roles are set in MD Portal → Security & Access → Staff Command
          Center, not via HR onboarding. HR-added ranks sync to MD Settings under{' '}
          {mdLedgerSectionLabel(corporateGroup)}.
        </p>
      ) : null}
    </>
  );
}
