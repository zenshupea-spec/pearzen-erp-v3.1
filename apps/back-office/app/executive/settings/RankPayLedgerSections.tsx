'use client';

import { CheckCircle2, Pencil, Plus, Trash2, X } from 'lucide-react';

import {
  OPERATIONAL_GROUP_LABELS,
  RANK_LEDGER_SECTIONS,
  isLockedExecutiveLedgerRank,
  isLockedSectorManagerLedgerRank,
  ranksForLedgerSection,
  type OperationalGroup,
  type RankLedgerSectionId,
  type RankPayEntry,
  type RankSalaryType,
} from '../../../../../packages/rank-pay-matrix';

export type RankPayDraft = Omit<RankPayEntry, 'id'>;

type RankPayLedgerSectionsProps = {
  rankPay: RankPayEntry[];
  editingRankId: string | null;
  editDraft: RankPayDraft;
  addingRankSection: RankLedgerSectionId | null;
  newRankDraft: RankPayDraft;
  rankMatrixSaving: boolean;
  canManageExecutiveRanks?: boolean;
  vaultLocked?: boolean;
  onRequestVaultUnlock?: () => void;
  onStartEdit: (rank: RankPayEntry) => void;
  onCancelEdit: () => void;
  onEditDraftChange: (draft: RankPayDraft) => void;
  onCommitEdit: () => void;
  onDelete: (id: string) => void;
  onStartAdd: (sectionId: RankLedgerSectionId) => void;
  onCancelAdd: () => void;
  onNewRankDraftChange: (draft: RankPayDraft) => void;
  onCommitAdd: () => void;
};

function operationalGroupOptions(sectionId: RankLedgerSectionId): OperationalGroup[] {
  return (
    RANK_LEDGER_SECTIONS.find((section) => section.id === sectionId)
      ?.operationalGroups ?? []
  );
}

function RankRow({
  rank,
  isEditing,
  editDraft,
  rankMatrixSaving,
  showPayAmounts,
  showPayCategory,
  payCategoryOptions,
  onStartEdit,
  onCancelEdit,
  onEditDraftChange,
  onCommitEdit,
  onDelete,
  vaultLocked = false,
  onRequestVaultUnlock,
  canEditRank = true,
}: {
  rank: RankPayEntry;
  isEditing: boolean;
  editDraft: RankPayDraft;
  rankMatrixSaving: boolean;
  showPayAmounts: boolean;
  showPayCategory: boolean;
  payCategoryOptions: OperationalGroup[];
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onEditDraftChange: (draft: RankPayDraft) => void;
  onCommitEdit: () => void;
  onDelete: () => void;
  vaultLocked?: boolean;
  onRequestVaultUnlock?: () => void;
  canEditRank?: boolean;
}) {
  const isLockedRank =
    isLockedExecutiveLedgerRank(rank.rankCode) ||
    isLockedSectorManagerLedgerRank(rank.rankCode);
  const rankCodeLocked = isLockedRank;
  const guardRankWrite = (action: () => void) => {
    if (vaultLocked) {
      onRequestVaultUnlock?.();
      return;
    }
    action();
  };

  return (
    <tr
      className={`transition-colors ${
        isEditing ? 'bg-emerald-50/40' : 'bg-white/20 hover:bg-white/40'
      }`}
    >
      <td className="px-6 py-3">
        {isEditing && canEditRank ? (
          rankCodeLocked ? (
            <span className="inline-flex h-8 items-center justify-center rounded-lg border border-indigo-200/80 bg-indigo-50/80 px-3 font-mono text-sm font-black tracking-widest text-indigo-900">
              {rank.rankCode}
            </span>
          ) : (
          <input
            type="text"
            value={editDraft.rankCode}
            onChange={(e) =>
              onEditDraftChange({
                ...editDraft,
                rankCode: e.target.value.toUpperCase().slice(0, 6),
              })
            }
            placeholder="e.g. OIC"
            className="w-24 rounded-lg border border-emerald-200/80 bg-white/90 px-2.5 py-1.5 text-center font-mono text-sm font-black uppercase tracking-widest text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
          />
          )
        ) : (
          <span className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200/80 bg-slate-100/80 px-3 font-mono text-sm font-black tracking-widest text-slate-800">
            {rank.rankCode}
          </span>
        )}
      </td>
      <td className="px-6 py-3">
        {isEditing && canEditRank ? (
          <input
            type="text"
            value={editDraft.fullTitle}
            onChange={(e) =>
              onEditDraftChange({
                ...editDraft,
                fullTitle: e.target.value.toUpperCase(),
              })
            }
            placeholder="e.g. OFFICER IN CHARGE"
            className="w-full max-w-xs rounded-lg border border-emerald-200/80 bg-white/90 px-2.5 py-1.5 text-sm font-semibold uppercase text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
          />
        ) : (
          <span className="text-sm font-semibold uppercase text-slate-800">
            {rank.fullTitle}
            {isLockedRank ? (
              <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
                System rank
              </span>
            ) : null}
          </span>
        )}
      </td>
      {showPayAmounts ? (
        <td className="px-6 py-3 text-right">
          {isEditing ? (
            <div className="flex items-center justify-end gap-2">
              <span className="text-sm font-mono text-slate-600">LKR</span>
              <input
                type="number"
                min={0}
                value={editDraft.basicPay}
                onChange={(e) =>
                  onEditDraftChange({
                    ...editDraft,
                    basicPay: parseInt(e.target.value, 10) || 0,
                  })
                }
                className="w-32 rounded-lg border border-emerald-200/80 bg-white/90 py-1.5 pr-2 text-right text-sm font-black tabular-nums text-emerald-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
              />
            </div>
          ) : (
            <span className="font-mono text-sm font-black tabular-nums text-slate-900">
              {rank.basicPay.toLocaleString()}
            </span>
          )}
        </td>
      ) : null}
      {showPayCategory ? (
        <td className="px-6 py-3">
          {isEditing ? (
            <select
              value={editDraft.operationalGroup}
              onChange={(e) =>
                onEditDraftChange({
                  ...editDraft,
                  operationalGroup: e.target.value as OperationalGroup,
                })
              }
              className="w-full min-w-[10rem] rounded-lg border border-emerald-200/80 bg-white/90 px-2.5 py-1.5 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
            >
              {payCategoryOptions.map((group) => (
                <option key={group} value={group}>
                  {OPERATIONAL_GROUP_LABELS[group]}
                </option>
              ))}
            </select>
          ) : (
            <span className="inline-flex items-center rounded-lg border border-slate-200/80 bg-slate-100/80 px-2.5 py-1 text-sm font-bold text-slate-700">
              {OPERATIONAL_GROUP_LABELS[rank.operationalGroup]}
            </span>
          )}
        </td>
      ) : null}
      {showPayAmounts ? (
        <td className="px-6 py-3 text-right">
          {isEditing ? (
            <div className="flex items-center justify-end gap-2">
              <span className="text-sm font-mono text-slate-600">+</span>
              <input
                type="number"
                min={0}
                value={editDraft.annualIncrement}
                onChange={(e) =>
                  onEditDraftChange({
                    ...editDraft,
                    annualIncrement: parseInt(e.target.value, 10) || 0,
                  })
                }
                className="w-28 rounded-lg border border-emerald-200/80 bg-white/90 py-1.5 pr-2 text-right text-sm font-black tabular-nums text-emerald-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
              />
            </div>
          ) : (
            <span className="font-mono text-sm font-bold tabular-nums text-emerald-800">
              +{rank.annualIncrement.toLocaleString()}
            </span>
          )}
        </td>
      ) : null}
      <td className="px-6 py-3 text-right">
        {isEditing && canEditRank ? (
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => guardRankWrite(onCommitEdit)}
              disabled={
                rankMatrixSaving ||
                !editDraft.rankCode.trim() ||
                !editDraft.fullTitle.trim()
              }
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-200/80 bg-emerald-50/80 text-emerald-700 transition-all hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
              title={vaultLocked ? 'Unlock vault to save rank' : 'Save rank to database'}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-transparent text-slate-600 transition-all hover:border-slate-200 hover:bg-slate-50/80 hover:text-slate-600"
              title="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : canEditRank ? (
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => guardRankWrite(onStartEdit)}
              disabled={rankMatrixSaving}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-transparent text-slate-300 transition-all hover:border-indigo-200/80 hover:bg-indigo-50/80 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
              title={vaultLocked ? 'Unlock vault to edit rank' : 'Edit rank'}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {!isLockedRank ? (
              <button
                type="button"
                onClick={() => guardRankWrite(onDelete)}
                disabled={rankMatrixSaving}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-transparent text-slate-300 transition-all hover:border-rose-200/80 hover:bg-rose-50/80 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                title={vaultLocked ? 'Unlock vault to delete rank' : 'Delete rank'}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        ) : (
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            View only
          </span>
        )}
      </td>
    </tr>
  );
}

function AddRankRow({
  sectionId,
  newRankDraft,
  rankMatrixSaving,
  showPayAmounts,
  showPayCategory,
  payCategoryOptions,
  onNewRankDraftChange,
  onCommitAdd,
  onCancelAdd,
  vaultLocked = false,
  onRequestVaultUnlock,
}: {
  sectionId: RankLedgerSectionId;
  newRankDraft: RankPayDraft;
  rankMatrixSaving: boolean;
  showPayAmounts: boolean;
  showPayCategory: boolean;
  payCategoryOptions: OperationalGroup[];
  onNewRankDraftChange: (draft: RankPayDraft) => void;
  onCommitAdd: () => void;
  onCancelAdd: () => void;
  vaultLocked?: boolean;
  onRequestVaultUnlock?: () => void;
}) {
  const guardRankWrite = (action: () => void) => {
    if (vaultLocked) {
      onRequestVaultUnlock?.();
      return;
    }
    action();
  };

  return (
    <tr className="bg-emerald-50/30">
      <td className="px-6 py-3">
        <input
          type="text"
          value={newRankDraft.rankCode}
          onChange={(e) =>
            onNewRankDraftChange({
              ...newRankDraft,
              rankCode: e.target.value.toUpperCase().slice(0, 6),
            })
          }
          placeholder="e.g. DSO"
          autoFocus
          className="w-24 rounded-lg border border-emerald-300/80 bg-white/90 px-2.5 py-1.5 text-center font-mono text-sm font-black uppercase tracking-widest text-slate-900 shadow-sm placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
        />
      </td>
      <td className="px-6 py-3">
        <input
          type="text"
          value={newRankDraft.fullTitle}
          onChange={(e) =>
            onNewRankDraftChange({
              ...newRankDraft,
              fullTitle: e.target.value.toUpperCase(),
            })
          }
          placeholder="e.g. DEPUTY SECURITY OFFICER"
          className="w-full max-w-xs rounded-lg border border-emerald-300/80 bg-white/90 px-2.5 py-1.5 text-sm font-semibold uppercase text-slate-900 shadow-sm placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
        />
      </td>
      {showPayAmounts ? (
        <td className="px-6 py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            <span className="text-sm font-mono text-slate-600">LKR</span>
            <input
              type="number"
              min={0}
              value={newRankDraft.basicPay || ''}
              onChange={(e) =>
                onNewRankDraftChange({
                  ...newRankDraft,
                  basicPay: parseInt(e.target.value, 10) || 0,
                })
              }
              placeholder="0"
              className="w-32 rounded-lg border border-emerald-300/80 bg-white/90 py-1.5 pr-2 text-right text-sm font-black tabular-nums text-emerald-900 shadow-sm placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
            />
          </div>
        </td>
      ) : null}
      {showPayCategory ? (
        <td className="px-6 py-3">
          <select
            value={newRankDraft.operationalGroup}
            onChange={(e) =>
              onNewRankDraftChange({
                ...newRankDraft,
                operationalGroup: e.target.value as OperationalGroup,
              })
            }
            className="w-full min-w-[10rem] rounded-lg border border-emerald-300/80 bg-white/90 px-2.5 py-1.5 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
          >
            {payCategoryOptions.map((group) => (
              <option key={group} value={group}>
                {OPERATIONAL_GROUP_LABELS[group]}
              </option>
            ))}
          </select>
        </td>
      ) : null}
      {showPayAmounts ? (
        <td className="px-6 py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            <span className="text-sm font-mono text-slate-600">+</span>
            <input
              type="number"
              min={0}
              value={newRankDraft.annualIncrement || ''}
              onChange={(e) =>
                onNewRankDraftChange({
                  ...newRankDraft,
                  annualIncrement: parseInt(e.target.value, 10) || 0,
                })
              }
              placeholder="0"
              className="w-28 rounded-lg border border-emerald-300/80 bg-white/90 py-1.5 pr-2 text-right text-sm font-black tabular-nums text-emerald-900 shadow-sm placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
            />
          </div>
        </td>
      ) : null}
      <td className="px-6 py-3 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => guardRankWrite(onCommitAdd)}
            disabled={
              rankMatrixSaving ||
              !newRankDraft.rankCode.trim() ||
              !newRankDraft.fullTitle.trim()
            }
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-200/80 bg-emerald-50/80 text-emerald-700 transition-all hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
            title={vaultLocked ? 'Unlock vault to save rank' : `Save new ${sectionId} rank`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onCancelAdd}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-transparent text-slate-600 transition-all hover:border-slate-200 hover:bg-slate-50/80 hover:text-slate-600"
            title="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function RankPayLedgerSections({
  rankPay,
  editingRankId,
  editDraft,
  addingRankSection,
  newRankDraft,
  rankMatrixSaving,
  vaultLocked = false,
  onRequestVaultUnlock,
  onStartEdit,
  onCancelEdit,
  onEditDraftChange,
  onCommitEdit,
  onDelete,
  onStartAdd,
  onCancelAdd,
  onNewRankDraftChange,
  onCommitAdd,
  canManageExecutiveRanks = true,
}: RankPayLedgerSectionsProps) {
  const guardRankWrite = (action: () => void) => {
    if (vaultLocked) {
      onRequestVaultUnlock?.();
      return;
    }
    action();
  };

  const visibleRankPay = rankPay;

  return (
    <div className="divide-y divide-slate-200/70">
      {!canManageExecutiveRanks ? (
        <div className="border-b border-indigo-200/60 bg-indigo-50/50 px-6 py-3">
          <p className="text-xs font-semibold text-indigo-900">
            MD and OD ranks are view-only here — only MD or OD can edit executive ranks.
          </p>
        </div>
      ) : null}
      {RANK_LEDGER_SECTIONS.map((section) => {
        const sectionRanks = ranksForLedgerSection(visibleRankPay, section.id);
        const payCategoryOptions = operationalGroupOptions(section.id);
        const showPayCategory = payCategoryOptions.length > 1;
        const showPayAmounts = section.showRankPayAmounts;
        const isAddingHere = addingRankSection === section.id;

        return (
          <section key={section.id} id={`rank-pay-${section.id.toLowerCase().replace(/_/g, '-')}`} className="scroll-mt-24">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/60 bg-white/30 px-6 py-4">
              <div className="min-w-0">
                <h4 className="text-sm font-black uppercase tracking-widest text-slate-800">
                  {section.label}
                </h4>
                <p className="mt-1 text-xs font-medium text-slate-500">{section.description}</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  guardRankWrite(() => (isAddingHere ? onCancelAdd() : onStartAdd(section.id)))
                }
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest shadow-sm transition-all ${
                  isAddingHere
                    ? 'border-slate-300/80 bg-slate-100/80 text-slate-600'
                    : 'border-emerald-300/80 bg-emerald-600 text-white shadow-emerald-600/20 hover:bg-emerald-500'
                }`}
                title={vaultLocked && !isAddingHere ? 'Unlock vault to add ranks' : undefined}
              >
                <Plus className="h-3.5 w-3.5" />
                {isAddingHere ? 'Cancel' : 'Add rank'}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200/80 bg-slate-50/60 text-sm font-bold uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="w-28 px-6 py-3">Rank Code</th>
                    <th className="px-6 py-3">Full Title</th>
                    {showPayAmounts ? (
                      <th className="px-6 py-3 text-right">Base Monthly Pay (LKR)</th>
                    ) : null}
                    {showPayCategory ? (
                      <th className="px-6 py-3">Pay Category</th>
                    ) : null}
                    {showPayAmounts ? (
                      <th className="px-6 py-3 text-right">Annual Increment (LKR)</th>
                    ) : null}
                    <th className="w-24 px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60">
                  {sectionRanks.map((rank) => (
                    <RankRow
                      key={rank.id}
                      rank={rank}
                      isEditing={editingRankId === rank.id}
                      editDraft={editDraft}
                      rankMatrixSaving={rankMatrixSaving}
                      showPayAmounts={showPayAmounts}
                      showPayCategory={showPayCategory}
                      payCategoryOptions={payCategoryOptions}
                      onStartEdit={() => onStartEdit(rank)}
                      onCancelEdit={onCancelEdit}
                      onEditDraftChange={onEditDraftChange}
                      onCommitEdit={onCommitEdit}
                      onDelete={() => onDelete(rank.id)}
                      vaultLocked={vaultLocked}
                      onRequestVaultUnlock={onRequestVaultUnlock}
                      canEditRank={
                        !isLockedExecutiveLedgerRank(rank.rankCode) || canManageExecutiveRanks
                      }
                    />
                  ))}
                  {isAddingHere ? (
                    <AddRankRow
                      sectionId={section.id}
                      newRankDraft={newRankDraft}
                      rankMatrixSaving={rankMatrixSaving}
                      showPayAmounts={showPayAmounts}
                      showPayCategory={showPayCategory}
                      payCategoryOptions={payCategoryOptions}
                      onNewRankDraftChange={onNewRankDraftChange}
                      onCommitAdd={onCommitAdd}
                      onCancelAdd={onCancelAdd}
                      vaultLocked={vaultLocked}
                      onRequestVaultUnlock={onRequestVaultUnlock}
                    />
                  ) : null}
                </tbody>
              </table>
            </div>

            {sectionRanks.length === 0 && !isAddingHere ? (
              <div className="px-6 py-8 text-center text-sm text-slate-500">
                No {section.label.toLowerCase()} ranks defined yet.
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

export function blankRankDraftForSection(
  sectionId: RankLedgerSectionId,
): RankPayDraft {
  const section = RANK_LEDGER_SECTIONS.find((entry) => entry.id === sectionId);
  return {
    rankCode: '',
    fullTitle: '',
    basicPay: 0,
    annualIncrement: 0,
    salaryType: 'BANK' satisfies RankSalaryType,
    operationalGroup: section?.defaultOperationalGroup ?? 'GUARD_FIELD',
  };
}
