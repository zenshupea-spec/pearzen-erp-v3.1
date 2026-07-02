'use client';

import Link from 'next/link';
import { ExternalLink, Loader2, UserMinus, UserPlus } from 'lucide-react';

import { CVS_BRAND_CLASSES } from '../../../lib/cvs-brand-tokens';
import {
  executiveMissingRecoveryEmail,
  maskRecoveryEmail,
} from '../../../lib/head-office-portal-recovery-email';
import { isExecutiveRank } from '../../../lib/portal-role-utils';
import {
  formatOtpChannelLabel,
  formatPasswordPolicyLabel,
  formatTwoFactorPolicyLabel,
  isCommandCenterSingletonRank,
  commandCenterRankLabel,
  type MdPortalCommandCenterRank,
} from '../../../lib/md-portal-staff-command-center-spec';
import type {
  ExecutiveRoleSlot,
  ExecutiveRolesPayload,
} from './executive-role-actions';
import type {
  PortalAccessLevel,
  PortalRbacPortalId,
} from '../../../../../packages/portal-rbac';
import type { StaffCommandCenterStaffRow } from './staff-command-center-actions';
import { StaffCommandCenterOtpBlock } from './StaffCommandCenterOtp';
import { StaffCommandCenterRbacBlock } from './StaffCommandCenterRbac';

const selectCls =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-[color:var(--cvs-accent)]/40';

export const STAFF_COLUMN_SHELL_CLS =
  'flex w-[min(100%,20rem)] min-w-[280px] max-w-[320px] flex-shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-white/75 bg-white/55 shadow-[0_12px_48px_-14px_rgba(15,23,42,0.12)] ring-1 ring-slate-900/[0.045] backdrop-blur-2xl';

export const VACANT_COLUMN_SHELL_CLS =
  'flex w-[min(100%,20rem)] min-w-[280px] max-w-[320px] flex-shrink-0 snap-start flex-col overflow-hidden rounded-2xl border-2 border-dashed border-slate-300/80 bg-slate-50/40';

function rankBadgeCls(rank: string | null): string {
  if (rank === 'MD') return CVS_BRAND_CLASSES.rankBadge;
  if (rank === 'OD') return 'border-sky-200/80 bg-sky-50/80 text-sky-800';
  if (rank === 'FM') return 'border-emerald-200/80 bg-emerald-50/80 text-emerald-900';
  return 'border-slate-200/80 bg-white/90 text-slate-700';
}

function PortalStatusChips({ person }: { person: StaffCommandCenterStaffRow }) {
  const { portalAuth, status } = person;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      <span
        className={`inline-flex rounded-full border px-1.5 py-px text-[9px] font-black uppercase tracking-wider ${
          status === 'ACTIVE'
            ? 'border-emerald-200/80 bg-emerald-50/80 text-emerald-800'
            : 'border-amber-200/80 bg-amber-50/80 text-amber-800'
        }`}
      >
        {status}
      </span>
      {portalAuth.isProvisioned && portalAuth.isActive ? (
        <span className="inline-flex rounded-full border border-violet-200/80 bg-violet-50/80 px-1.5 py-px text-[9px] font-black uppercase tracking-wider text-violet-800">
          Portal on
        </span>
      ) : (
        <span className="inline-flex rounded-full border border-slate-200/80 bg-slate-100/80 px-1.5 py-px text-[9px] font-black uppercase tracking-wider text-slate-500">
          Not provisioned
        </span>
      )}
      {isExecutiveRank(person.rank) ? (
        <span className="inline-flex rounded-full border border-[color:var(--cvs-accent-muted)]/80 bg-[var(--cvs-accent-soft)]/80 px-1.5 py-px text-[9px] font-black uppercase tracking-wider text-[color:var(--cvs-accent)]">
          MD Portal
        </span>
      ) : null}
      {person.isLocked ? (
        <span className="inline-flex rounded-full border border-slate-200/80 bg-slate-100/80 px-1.5 py-px text-[9px] font-black uppercase tracking-wider text-slate-600">
          RBAC locked
        </span>
      ) : null}
    </div>
  );
}

function SecurityStrip({ person }: { person: StaffCommandCenterStaffRow }) {
  const policy = person.securityPolicy;
  const recoveryEmail = person.portalAuth.recoveryEmail;
  const missingRecovery = executiveMissingRecoveryEmail(person.rank, recoveryEmail);

  return (
    <div className="space-y-1.5 rounded-xl border border-slate-200/70 bg-slate-50/80 px-3 py-2 text-[10px] font-semibold leading-relaxed text-slate-600">
      <p>
        {formatPasswordPolicyLabel(policy)} · {formatOtpChannelLabel(policy)}
      </p>
      <p className="flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[9px] font-black uppercase tracking-wider ${
            person.portalAuth.twoFactorEnabled
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              person.portalAuth.twoFactorEnabled ? 'bg-emerald-500' : 'bg-rose-500'
            }`}
          />
          {formatTwoFactorPolicyLabel(policy, person.portalAuth.twoFactorEnabled)}
        </span>
      </p>
      {policy.recoveryEmailRequired ? (
        <p className={missingRecovery ? 'font-bold text-rose-700' : 'text-slate-600'}>
          Recovery email: {maskRecoveryEmail(recoveryEmail)}
          {missingRecovery ? ' — required before OTP' : ''}
        </p>
      ) : null}
    </div>
  );
}

function ExecutiveRoleControls({
  slot,
  executiveRoles,
  assignEmployeeId,
  clearReplacementRank,
  onAssignEmployeeChange,
  onClearReplacementChange,
  onAssign,
  onClear,
  busy,
  compact,
}: {
  slot: ExecutiveRoleSlot;
  executiveRoles: ExecutiveRolesPayload;
  assignEmployeeId: string;
  clearReplacementRank: string;
  onAssignEmployeeChange: (value: string) => void;
  onClearReplacementChange: (value: string) => void;
  onAssign: () => void;
  onClear: () => void;
  busy: boolean;
  compact?: boolean;
}) {
  const assignCandidates = executiveRoles.candidates.filter(
    (person) => (person.rank ?? '').trim().toUpperCase() !== slot.rankCode,
  );

  return (
    <div className={`space-y-3 ${compact ? '' : 'rounded-xl border border-slate-200/80 bg-white/60 p-3'}`}>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
        Executive role · {slot.title}
      </p>
      <div>
        <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">
          {slot.holder ? 'Transfer to' : 'Assign to'}
        </label>
        <select
          value={assignEmployeeId}
          onChange={(event) => onAssignEmployeeChange(event.target.value)}
          className={selectCls}
        >
          <option value="">Select Head Office staff…</option>
          {assignCandidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.fullName}
              {candidate.rank ? ` (${candidate.rank})` : ''}
              {!candidate.email ? ' — no email' : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || !assignEmployeeId}
          onClick={onAssign}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[color:var(--cvs-accent)] px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-white hover:bg-[color:var(--cvs-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
          {slot.holder ? `Assign ${slot.rankCode}` : `Set ${slot.rankCode}`}
        </button>
      </div>

      {slot.holder ? (
        <div className="border-t border-slate-200/70 pt-3">
          <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">
            Remove role → replacement rank
          </label>
          <select
            value={clearReplacementRank}
            onChange={(event) => onClearReplacementChange(event.target.value)}
            className={selectCls}
          >
            <option value="">Select replacement rank…</option>
            {executiveRoles.replacementRanks.map((rank) => (
              <option key={rank.id} value={rank.rankCode}>
                {rank.rankCode} — {rank.fullTitle}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !clearReplacementRank}
            onClick={onClear}
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-rose-800 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <UserMinus className="h-3 w-3" />
            )}
            Remove {slot.rankCode}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function VacantSingletonColumn({
  rank,
  slot,
  executiveRoles,
  assignEmployeeId,
  onAssignEmployeeChange,
  onAssign,
  busy,
}: {
  rank: MdPortalCommandCenterRank;
  slot: ExecutiveRoleSlot;
  executiveRoles: ExecutiveRolesPayload;
  assignEmployeeId: string;
  onAssignEmployeeChange: (value: string) => void;
  onAssign: () => void;
  busy: boolean;
}) {
  return (
    <article className={VACANT_COLUMN_SHELL_CLS}>
      <div className="border-b border-dashed border-slate-300/80 bg-slate-50/60 px-4 py-4 text-center">
        <span
          className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest ${rankBadgeCls(rank)}`}
        >
          Vacant · {rank}
        </span>
        <p className="mt-2 text-sm font-bold text-slate-800">
          {commandCenterRankLabel(rank)}
        </p>
        <p className="mt-1 text-xs font-medium text-slate-500">
          Assign below — OTP and permissions after holder is set.
        </p>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <ExecutiveRoleControls
          slot={slot}
          executiveRoles={executiveRoles}
          assignEmployeeId={assignEmployeeId}
          clearReplacementRank=""
          onAssignEmployeeChange={onAssignEmployeeChange}
          onClearReplacementChange={() => undefined}
          onAssign={onAssign}
          onClear={() => undefined}
          busy={busy}
          compact
        />
      </div>
    </article>
  );
}

export function StaffCommandCenterColumn({
  person,
  singletonSlot,
  sessionEmployeeId,
  sessionRole,
  recoveryEmailDraft,
  onRecoveryEmailChange,
  otpGenerating,
  otpResettingAccess,
  otpResettingTwoFactor,
  otpUnlocking,
  anyOtpBusy,
  onGenerateOtp,
  onResetAccess,
  onUnlockUsername,
  onResetTwoFactor,
  getAccessLevel,
  onAccessChange,
}: {
  person: StaffCommandCenterStaffRow;
  /** Present for MD/OD/FM holders — read-only label only (no transfer UI). */
  singletonSlot: ExecutiveRoleSlot | null;
  sessionEmployeeId: string | null;
  sessionRole: string | null;
  recoveryEmailDraft: string;
  onRecoveryEmailChange: (value: string) => void;
  otpGenerating: boolean;
  otpResettingAccess: boolean;
  otpResettingTwoFactor: boolean;
  otpUnlocking: boolean;
  anyOtpBusy: boolean;
  onGenerateOtp: () => void;
  onResetAccess: () => void;
  onUnlockUsername: () => void;
  onResetTwoFactor: () => void;
  getAccessLevel: (portalId: PortalRbacPortalId) => PortalAccessLevel;
  onAccessChange: (portalId: PortalRbacPortalId, level: PortalAccessLevel) => void;
}) {
  const normalizedRank = (person.rank ?? '').trim().toUpperCase();
  const isSingletonHolder =
    singletonSlot &&
    isCommandCenterSingletonRank(normalizedRank) &&
    singletonSlot.rankCode === normalizedRank;

  return (
    <article className={STAFF_COLUMN_SHELL_CLS}>
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-4 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-sm font-black text-slate-700">
            {(person.fullName.trim()[0] ?? '?').toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="truncate text-sm font-bold text-slate-900">{person.fullName}</h4>
            <p className="truncate text-xs font-medium text-slate-500">
              {person.email ?? 'No work email'}
            </p>
            <span
              className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${rankBadgeCls(person.rank)}`}
            >
              {person.rank ?? '—'}
            </span>
            <PortalStatusChips person={person} />
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <SecurityStrip person={person} />

        {isSingletonHolder && singletonSlot ? (
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2.5 text-xs font-semibold text-slate-600">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Executive role · {singletonSlot.title}
            </p>
            <p className="mt-1.5">
              Singleton rank — not transferable here. Update only in{' '}
              <Link
                href="/hr/mnr"
                className="inline-flex items-center gap-0.5 font-bold text-[color:var(--cvs-accent)] hover:underline"
              >
                HR → MNR
                <ExternalLink className="h-3 w-3" />
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2.5 text-xs font-semibold text-slate-600">
            Rank set in{' '}
            <Link
              href="/hr/mnr"
              className="inline-flex items-center gap-0.5 font-bold text-[color:var(--cvs-accent)] hover:underline"
            >
              HR → MNR
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        )}

        <StaffCommandCenterOtpBlock
          person={person}
          sessionEmployeeId={sessionEmployeeId}
          sessionRole={sessionRole}
          recoveryEmailDraft={recoveryEmailDraft}
          onRecoveryEmailChange={onRecoveryEmailChange}
          generating={otpGenerating}
          resettingAccess={otpResettingAccess}
          resettingTwoFactor={otpResettingTwoFactor}
          unlocking={otpUnlocking}
          anyOtpBusy={anyOtpBusy}
          onGenerateOtp={onGenerateOtp}
          onResetAccess={onResetAccess}
          onUnlockUsername={onUnlockUsername}
          onResetTwoFactor={onResetTwoFactor}
        />

        <StaffCommandCenterRbacBlock
          person={person}
          getAccessLevel={getAccessLevel}
          onAccessChange={onAccessChange}
        />
      </div>
    </article>
  );
}

export function findExecutiveSlotForRank(
  executiveRoles: ExecutiveRolesPayload,
  rank: MdPortalCommandCenterRank,
): ExecutiveRoleSlot | undefined {
  return executiveRoles.slots.find((slot) => slot.rankCode === rank);
}
