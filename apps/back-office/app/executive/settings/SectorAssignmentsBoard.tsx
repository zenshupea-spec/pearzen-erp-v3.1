'use client';

import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  LayoutGrid,
  Loader2,
  MapPin,
} from 'lucide-react';

import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';
import { ExecutivePageLoading } from '../../../components/executive/ExecutivePageChrome';
import {
  formatOtpChannelLabel,
  portalSecurityPolicyForRank,
  SECTOR_ASSIGNMENT_ROLE_CODES,
  sectorAssignmentRoleLabel,
  type SectorAssignmentRoleCode,
} from '../../../lib/md-portal-staff-command-center-spec';
import { formatSectorRoleCandidateLabel } from '../../../lib/sector-role-assignment-spec';
import {
  assignSectorRoleAction,
  clearSectorRoleAction,
  getSectorRoleAssignmentBoard,
  type SectorRoleAssignmentBoard,
  type SectorRoleAssignmentCandidate,
  type SectorRoleAssignmentSectorCard,
  type SectorRoleAssignee,
} from '../../om/actions/sector-role-assignments';

const selectCls =
  'w-full appearance-none rounded-lg border border-slate-200/80 bg-white/95 py-1.5 pl-2 pr-7 text-[10px] font-bold text-slate-800 shadow-sm outline-none transition focus:ring-2 focus:ring-[color:var(--cvs-accent)]/35 disabled:cursor-not-allowed disabled:opacity-60';

function sectorRoleSecurityFootnote(roleCode: SectorAssignmentRoleCode): string {
  const policy = portalSecurityPolicyForRank(roleCode);
  const login = policy.loginPortal ? `/login/${policy.loginPortal}` : 'Portal TBD';
  return `${login} · ${formatOtpChannelLabel(policy)} · TOTP 2FA`;
}

function SectorRolePicker({
  smEpf,
  roleCode,
  assignee,
  candidates,
  disabled,
  saving,
  onAssign,
  onClear,
}: {
  smEpf: string;
  roleCode: SectorAssignmentRoleCode;
  assignee: SectorRoleAssignee | undefined;
  candidates: SectorRoleAssignmentCandidate[];
  disabled: boolean;
  saving: boolean;
  onAssign: (employeeId: string) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const handleChange = async (event: ChangeEvent<HTMLSelectElement>) => {
    const nextEmployeeId = event.target.value.trim();
    if (!nextEmployeeId) {
      await onClear();
      return;
    }
    await onAssign(nextEmployeeId);
  };

  return (
    <div className="space-y-1">
      <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500">
        {roleCode} · {sectorAssignmentRoleLabel(roleCode)}
      </label>
      {disabled ? (
        <p className="rounded-lg border border-slate-200/70 bg-slate-50/80 px-2 py-1.5 text-[10px] font-semibold text-slate-700">
          {assignee
            ? formatSectorRoleCandidateLabel(assignee.fullName, assignee.epfNo)
            : '— Unassigned'}
        </p>
      ) : (
        <div className="relative">
          <select
            value={assignee?.employeeId ?? ''}
            onChange={(event) => void handleChange(event)}
            disabled={saving || candidates.length === 0}
            aria-label={`Assign ${roleCode} for sector ${smEpf}`}
            className={selectCls}
          >
            <option value="">Unassigned</option>
            {candidates.map((candidate) => (
              <option key={candidate.employeeId} value={candidate.employeeId}>
                {formatSectorRoleCandidateLabel(candidate.fullName, candidate.epfNo)}
              </option>
            ))}
          </select>
          {saving ? (
            <Loader2 className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin text-slate-400" />
          ) : (
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
          )}
        </div>
      )}
      {assignee ? (
        <p className="text-[9px] font-medium leading-relaxed text-slate-500">
          {sectorRoleSecurityFootnote(roleCode)}
        </p>
      ) : candidates.length === 0 && !disabled ? (
        <p className="text-[9px] font-medium text-slate-400">No {roleCode} in MNR</p>
      ) : null}
    </div>
  );
}

function SectorAssignmentCard({
  sector,
  candidatesByRole,
  canAssign,
  busyKey,
  onBusyKey,
  onBoardUpdate,
  onSuccess,
  onError,
}: {
  sector: SectorRoleAssignmentSectorCard;
  candidatesByRole: SectorRoleAssignmentBoard['candidatesByRole'];
  canAssign: boolean;
  busyKey: string | null;
  onBusyKey: (key: string | null) => void;
  onBoardUpdate: (
    updater: (prev: SectorRoleAssignmentBoard) => SectorRoleAssignmentBoard,
  ) => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}) {
  const handleAssign = async (
    roleCode: SectorAssignmentRoleCode,
    employeeId: string,
  ) => {
    const key = `${sector.smEpf}:${roleCode}`;
    const previous = sector.assignments[roleCode];
    const candidate = candidatesByRole[roleCode]?.find(
      (row) => row.employeeId === employeeId,
    );
    if (!candidate) {
      onError('Selected employee is no longer available.');
      return;
    }

    const optimistic: SectorRoleAssignee = {
      employeeId: candidate.employeeId,
      fullName: candidate.fullName,
      epfNo: candidate.epfNo,
      rank: roleCode,
    };

    onBusyKey(key);
    onBoardUpdate((prev) => ({
      ...prev,
      sectors: prev.sectors.map((card) =>
        card.smEpf === sector.smEpf
          ? {
              ...card,
              assignments: { ...card.assignments, [roleCode]: optimistic },
            }
          : card,
      ),
    }));

    const result = await assignSectorRoleAction({
      smEpf: sector.smEpf,
      roleCode,
      employeeId,
    });
    onBusyKey(null);

    if (!result.success) {
      onBoardUpdate((prev) => ({
        ...prev,
        sectors: prev.sectors.map((card) =>
          card.smEpf === sector.smEpf
            ? {
                ...card,
                assignments: previous
                  ? { ...card.assignments, [roleCode]: previous }
                  : Object.fromEntries(
                      Object.entries(card.assignments).filter(
                        ([code]) => code !== roleCode,
                      ),
                    ),
              }
            : card,
        ),
      }));
      onError(result.error);
      return;
    }

    onSuccess(
      `Assigned ${formatSectorRoleCandidateLabel(candidate.fullName, candidate.epfNo)} as ${roleCode} for ${sector.smLabel}`,
    );
  };

  const handleClear = async (roleCode: SectorAssignmentRoleCode) => {
    const key = `${sector.smEpf}:${roleCode}`;
    const previous = sector.assignments[roleCode];

    onBusyKey(key);
    onBoardUpdate((prev) => ({
      ...prev,
      sectors: prev.sectors.map((card) =>
        card.smEpf === sector.smEpf
          ? {
              ...card,
              assignments: Object.fromEntries(
                Object.entries(card.assignments).filter(
                  ([code]) => code !== roleCode,
                ),
              ),
            }
          : card,
      ),
    }));

    const result = await clearSectorRoleAction({ smEpf: sector.smEpf, roleCode });
    onBusyKey(null);

    if (!result.success) {
      onBoardUpdate((prev) => ({
        ...prev,
        sectors: prev.sectors.map((card) =>
          card.smEpf === sector.smEpf
            ? {
                ...card,
                assignments: previous
                  ? { ...card.assignments, [roleCode]: previous }
                  : card.assignments,
              }
            : card,
        ),
      }));
      onError(result.error);
      return;
    }

    onSuccess(`Cleared ${roleCode} for ${sector.smLabel}`);
  };

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-white/75 bg-white/55 p-4 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.1)] ring-1 ring-slate-900/[0.04] backdrop-blur-xl">
      <header className="border-b border-slate-200/60 pb-3">
        <p className="text-sm font-bold text-slate-900">{sector.smLabel}</p>
        <p className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-slate-500">
          <MapPin className="h-3 w-3 shrink-0" />
          {sector.regionLabel}
          <span className="text-slate-300">·</span>
          <span className="font-mono text-[9px] uppercase tracking-wide text-slate-400">
            {sector.smEpf}
          </span>
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {SECTOR_ASSIGNMENT_ROLE_CODES.map((roleCode) => (
          <SectorRolePicker
            key={roleCode}
            smEpf={sector.smEpf}
            roleCode={roleCode}
            assignee={sector.assignments[roleCode]}
            candidates={candidatesByRole[roleCode] ?? []}
            disabled={!canAssign}
            saving={busyKey === `${sector.smEpf}:${roleCode}`}
            onAssign={(employeeId) => handleAssign(roleCode, employeeId)}
            onClear={() => handleClear(roleCode)}
          />
        ))}
      </div>
    </article>
  );
}

export default function SectorAssignmentsBoard() {
  const [board, setBoard] = useState<SectorRoleAssignmentBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toastSuccess, setToastSuccess] = useState<string | null>(null);
  const [toastError, setToastError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await getSectorRoleAssignmentBoard();
      if ('error' in result) {
        setLoadError(result.error);
        setBoard(null);
        return;
      }
      setBoard(result);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Failed to load sector assignments.',
      );
      setBoard(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleSuccess = (message: string) => {
    setToastError(null);
    setToastSuccess(message);
    window.setTimeout(() => setToastSuccess(null), 3500);
  };

  const handleError = (message: string) => {
    setToastSuccess(null);
    setToastError(message);
  };

  return (
    <ExecutiveGlassCard className="overflow-hidden">
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-indigo-200/80 bg-indigo-50/80">
              <LayoutGrid className="h-5 w-5 text-indigo-700" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Sector Assignments</h3>
              <p className="text-sm font-medium text-slate-600">
                Assign OM, FM, TM, AD, and EA per SM portfolio. OM scope lock applies
                immediately; other roles are stored for sector ownership.
              </p>
            </div>
          </div>
          {board && !board.canAssign ? (
            <span className="rounded-full border border-slate-200/80 bg-slate-100/90 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-slate-600">
              Read-only · MD/OD edit
            </span>
          ) : null}
        </div>
      </div>

      {loadError ? (
        <div className="flex items-start gap-2 border-b border-rose-100 bg-rose-50 px-6 py-3 text-sm font-semibold text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {loadError}
        </div>
      ) : null}

      {toastSuccess ? (
        <div className="flex items-start gap-2 border-b border-emerald-100 bg-emerald-50 px-6 py-3 text-sm font-semibold text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {toastSuccess}
        </div>
      ) : null}

      {toastError ? (
        <div className="flex items-start gap-2 border-b border-rose-100 bg-rose-50 px-6 py-3 text-sm font-semibold text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {toastError}
        </div>
      ) : null}

      <div className="p-6">
        {loading ? (
          <ExecutivePageLoading
            message="Loading sector portfolios from field radar…"
            className="min-h-[10rem] py-6"
          />
        ) : !board || board.sectors.length === 0 ? (
          <div className="rounded-2xl border border-slate-200/80 bg-white/40 px-6 py-10 text-center">
            <p className="font-bold text-slate-800">No sector portfolios yet</p>
            <p className="mt-2 text-sm font-medium text-slate-600">
              Sector cards appear when SM portfolios exist in CV Operations field radar.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {board.sectors.map((sector) => (
              <SectorAssignmentCard
                key={sector.smEpf}
                sector={sector}
                candidatesByRole={board.candidatesByRole}
                canAssign={board.canAssign}
                busyKey={busyKey}
                onBusyKey={setBusyKey}
                onBoardUpdate={(updater) =>
                  setBoard((prev) => (prev ? updater(prev) : prev))
                }
                onSuccess={handleSuccess}
                onError={handleError}
              />
            ))}
          </div>
        )}
      </div>
    </ExecutiveGlassCard>
  );
}
