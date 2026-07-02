'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Shield,
  Users,
} from 'lucide-react';

import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';
import { ExecutivePageLoading } from '../../../components/executive/ExecutivePageChrome';
import { readDeviceGeolocationWithRetry } from '../../../lib/device-geolocation';
import {
  makeBlankPortalRbacRow,
  type PortalAccessLevel,
  type PortalRbacMatrix,
  type PortalRbacPortalId,
} from '../../../../../packages/portal-rbac';
import { otpLifetimeMsForRank } from '../../../lib/executive-portal-auth-policy';
import { isExecutiveRank } from '../../../lib/portal-role-utils';
import {
  formatOtpChannelLabel,
  formatPasswordPolicyLabel,
  isCommandCenterSingletonRank,
  MD_PORTAL_COMMAND_CENTER_RANKS,
  portalSecurityPolicyForRank,
} from '../../../lib/md-portal-staff-command-center-spec';
import {
  assignExecutiveRoleAction,
  type ExecutiveRoleSlot,
} from './executive-role-actions';
import {
  getStaffCommandCenterPayload,
  type StaffCommandCenterPayload,
  type StaffCommandCenterStaffRow,
} from './staff-command-center-actions';
import {
  GeneratedOtpBanner,
  type GeneratedOtpState,
} from './StaffCommandCenterOtp';
import {
  provisionHeadOfficePortalOtpAction,
  resetHeadOfficePortalAccessAction,
  resetHeadOfficeTwoFactorAction,
  unlockHeadOfficePortalUsernameAction,
} from './portal-auth-actions';
import {
  findExecutiveSlotForRank,
  StaffCommandCenterColumn,
  VacantSingletonColumn,
} from './StaffCommandCenterColumn';
import { StaffCommandCenterRbacSaveFooter } from './StaffCommandCenterRbac';
import { savePortalRbacMatrix } from './rbac-actions';
import { SettingsTraceability } from './settings-section-ui';
import type { SettingsSectionAudit } from './settings-traceability-actions';
import SectorAssignmentsBoard from './SectorAssignmentsBoard';

function SecurityPolicyLegend() {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-slate-200/60 bg-white/30">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-6 py-3 text-left transition hover:bg-white/40"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-bold text-slate-700">
          <Shield className="h-4 w-4 text-violet-600" />
          Security policy by rank
        </span>
        <ChevronDown
          className={`h-4 w-4 text-slate-400 transition ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? (
        <div className="overflow-x-auto px-6 pb-4">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <th className="py-2 pr-3">Rank</th>
                <th className="py-2 pr-3">Login</th>
                <th className="py-2 pr-3">Password</th>
                <th className="py-2 pr-3">OTP</th>
                <th className="py-2 pr-3">Recovery</th>
                <th className="py-2">2FA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/80">
              {MD_PORTAL_COMMAND_CENTER_RANKS.map((rank) => {
                const policy = portalSecurityPolicyForRank(rank);
                return (
                  <tr key={rank} className="text-slate-700">
                    <td className="py-2 pr-3 font-bold">{rank}</td>
                    <td className="py-2 pr-3 font-mono text-[11px]">
                      /login/{policy.loginPortal ?? '—'}
                    </td>
                    <td className="py-2 pr-3">{formatPasswordPolicyLabel(policy)}</td>
                    <td className="py-2 pr-3">
                      6-digit · {formatOtpChannelLabel(policy)}
                    </td>
                    <td className="py-2 pr-3">
                      {policy.recoveryEmailRequired ? 'Required' : '—'}
                    </td>
                    <td className="py-2">TOTP required</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export default function StaffCommandCenter({
  audit,
}: {
  audit?: SettingsSectionAudit;
}) {
  const [payload, setPayload] = useState<StaffCommandCenterPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleSuccess, setRoleSuccess] = useState<string | null>(null);
  const [busyRank, setBusyRank] = useState<string | null>(null);
  const [assignDraft, setAssignDraft] = useState<Record<string, string>>({});
  const [authError, setAuthError] = useState<string | null>(null);
  const [generatedOtp, setGeneratedOtp] = useState<GeneratedOtpState | null>(null);
  const [recoveryEmails, setRecoveryEmails] = useState<Record<string, string>>({});
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resettingTwoFactorId, setResettingTwoFactorId] = useState<string | null>(null);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<PortalRbacMatrix>({});
  const [rbacSaving, setRbacSaving] = useState(false);
  const [rbacSaved, setRbacSaved] = useState(false);
  const [rbacError, setRbacError] = useState<string | null>(null);

  const updateStaffRow = (
    employeeId: string,
    updater: (row: StaffCommandCenterStaffRow) => StaffCommandCenterStaffRow,
  ) => {
    setPayload((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        staff: prev.staff.map((row) => (row.id === employeeId ? updater(row) : row)),
      };
    });
  };

  const syncRecoveryEmailsFromPayload = (next: StaffCommandCenterPayload) => {
    setRecoveryEmails(
      Object.fromEntries(
        next.staff.map((person) => [
          person.id,
          person.portalAuth.recoveryEmail ?? '',
        ]),
      ),
    );
  };

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getStaffCommandCenterPayload();
      if ('error' in result) {
        setError(result.error);
        setPayload(null);
        return;
      }
      setPayload(result);
      setMatrix(result.matrix);
      syncRecoveryEmailsFromPayload(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Staff Command Center.');
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleAssign = async (slot: ExecutiveRoleSlot) => {
    const employeeId = assignDraft[slot.rankCode]?.trim();
    if (!employeeId) {
      setError(`Choose a staff member to assign as ${slot.rankCode}.`);
      return;
    }
    setBusyRank(slot.rankCode);
    setError(null);
    setRoleSuccess(null);
    try {
      const result = await assignExecutiveRoleAction(employeeId, slot.rankCode);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setRoleSuccess(`${slot.rankCode} role updated. Issue portal OTP below if needed.`);
      setAssignDraft((prev) => ({ ...prev, [slot.rankCode]: '' }));
      await reload();
    } finally {
      setBusyRank(null);
    }
  };

  const handleGenerateOtp = async (person: StaffCommandCenterStaffRow) => {
    setAuthError(null);
    setGeneratedOtp(null);
    setGeneratingId(person.id);

    const geo = await readDeviceGeolocationWithRetry().catch(() => null);
    const lat = geo && geo.ok ? geo.latitude : null;
    const lng = geo && geo.ok ? geo.longitude : null;

    const result = await provisionHeadOfficePortalOtpAction(
      person.id,
      lat,
      lng,
      isExecutiveRank(person.rank) && payload?.sessionEmployeeId !== person.id
        ? recoveryEmails[person.id] ?? null
        : null,
    );
    setGeneratingId(null);
    if (result.error) {
      setAuthError(result.error);
      return;
    }
    if (result.success) {
      const otpLifetimeMs =
        result.otpLifetimeMs ?? otpLifetimeMsForRank(person.rank);
      setGeneratedOtp({
        emailed: Boolean(result.emailed),
        otp: result.otp,
        emailWarning: result.emailWarning,
        staffName: result.staffName ?? person.fullName,
        email: result.email ?? person.email ?? '—',
        loginUsername: result.loginUsername ?? undefined,
        expiresAt: result.expiresAt ?? Date.now() + otpLifetimeMs,
        otpLifetimeMs,
        provisionedBy: result.provisionedBy ?? 'Executive',
        provisionedWhere: result.provisionedWhere ?? '—',
        employeeId: person.id,
      });
      const recoverySaved =
        isExecutiveRank(person.rank)
          ? recoveryEmails[person.id]?.trim() ||
            person.portalAuth.recoveryEmail?.trim() ||
            null
          : null;
      updateStaffRow(person.id, (row) => ({
        ...row,
        portalAuth: {
          ...row.portalAuth,
          isProvisioned: true,
          isActive: true,
          twoFactorEnabled: false,
          isUsernameLocked: false,
          loginUsername: result.loginUsername ?? row.portalAuth.loginUsername,
          recoveryEmail: recoverySaved ?? row.portalAuth.recoveryEmail,
          lastOtpProvisionedAt: new Date().toISOString(),
          lastOtpProvisionedByName: result.provisionedBy ?? 'Executive',
          lastOtpProvisionedLocationLabel: result.provisionedWhere ?? '—',
        },
      }));
      if (recoverySaved) {
        setRecoveryEmails((prev) => ({ ...prev, [person.id]: recoverySaved }));
      }
    }
  };

  const handleResetAccess = async (person: StaffCommandCenterStaffRow) => {
    setAuthError(null);
    setResettingId(person.id);
    const result = await resetHeadOfficePortalAccessAction(person.id);
    setResettingId(null);
    if (result.error) {
      setAuthError(result.error);
      return;
    }
    setGeneratedOtp(null);
    await reload();
  };

  const handleUnlockUsername = async (person: StaffCommandCenterStaffRow) => {
    setAuthError(null);
    setUnlockingId(person.id);
    const result = await unlockHeadOfficePortalUsernameAction(person.id);
    setUnlockingId(null);
    if (result.error) {
      setAuthError(result.error);
      return;
    }
    updateStaffRow(person.id, (row) => ({
      ...row,
      portalAuth: {
        ...row.portalAuth,
        isUsernameLocked: false,
      },
    }));
  };

  const handleResetTwoFactor = async (person: StaffCommandCenterStaffRow) => {
    setAuthError(null);
    setResettingTwoFactorId(person.id);
    const result = await resetHeadOfficeTwoFactorAction(person.id);
    setResettingTwoFactorId(null);
    if (result.error) {
      setAuthError(result.error);
      return;
    }
    updateStaffRow(person.id, (row) => ({
      ...row,
      portalAuth: {
        ...row.portalAuth,
        twoFactorEnabled: false,
      },
    }));
  };

  const anyOtpBusy =
    generatingId !== null ||
    resettingId !== null ||
    resettingTwoFactorId !== null ||
    unlockingId !== null;

  const getCell = (employeeId: string, portalId: string): PortalAccessLevel =>
    matrix[employeeId]?.[portalId] ?? 'NONE';

  const setCell = (
    employeeId: string,
    portalId: PortalRbacPortalId,
    val: PortalAccessLevel,
  ) => {
    setRbacSaved(false);
    setRbacError(null);
    setMatrix((prev) => ({
      ...prev,
      [employeeId]: {
        ...(prev[employeeId] ?? makeBlankPortalRbacRow()),
        [portalId]: val,
      },
    }));
  };

  const handleSaveRbac = async () => {
    setRbacSaving(true);
    setRbacError(null);
    const result = await savePortalRbacMatrix(matrix);
    setRbacSaving(false);
    if (!result.success) {
      setRbacError(result.error ?? 'Failed to save permissions');
      return;
    }
    setRbacSaved(true);
    setTimeout(() => setRbacSaved(false), 2500);
  };

  const hasColumns =
    (payload?.staff.length ?? 0) > 0 || (payload?.vacantSingletonRanks.length ?? 0) > 0;

  return (
    <>
    <ExecutiveGlassCard className="overflow-hidden">
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-violet-200/80 bg-violet-50/80">
              <Users className="h-5 w-5 text-violet-700" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Staff Command Center</h3>
              <p className="text-sm font-medium text-slate-600">
                Head Office portal ranks from{' '}
                <Link
                  href="/hr/mnr"
                  className="inline-flex items-center gap-0.5 font-bold text-[color:var(--cvs-accent)] hover:underline"
                >
                  HR → MNR
                  <ExternalLink className="h-3 w-3" />
                </Link>
                . One column per person — role, security, OTP, and module access together.
              </p>
              <SettingsTraceability sectionId="portalRbac" audit={audit} />
            </div>
          </div>
        </div>
      </div>

      <SecurityPolicyLegend />

      {error ? (
        <div className="flex items-start gap-2 border-b border-rose-100 bg-rose-50 px-6 py-3 text-sm font-semibold text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {roleSuccess ? (
        <div className="flex items-start gap-2 border-b border-emerald-100 bg-emerald-50 px-6 py-3 text-sm font-semibold text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {roleSuccess}
        </div>
      ) : null}

      {authError ? (
        <div className="flex items-start gap-2 border-b border-rose-100 bg-rose-50 px-6 py-3 text-sm font-semibold text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {authError}
        </div>
      ) : null}

      <GeneratedOtpBanner
        generatedOtp={generatedOtp}
        onExpired={() => setGeneratedOtp(null)}
      />

      <div className="p-6">
        {loading ? (
          <ExecutivePageLoading
            message="Loading Staff Command Center…"
            className="min-h-[12rem] py-8"
          />
        ) : !hasColumns || !payload ? (
          <div className="rounded-2xl border border-slate-200/80 bg-white/40 px-6 py-12 text-center">
            <p className="font-bold text-slate-800">No portal-rank staff yet</p>
            <p className="mt-2 text-sm font-medium text-slate-600">
              Add employees in{' '}
              <Link href="/hr/mnr" className="font-bold text-[color:var(--cvs-accent)] hover:underline">
                HR → MNR
              </Link>
              , set group to <strong>Head Office</strong>, and assign ranks MD, OD, FM, OM, HR,
              EA, AD, or SC.
            </p>
          </div>
        ) : (
          <div className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 md:mx-0">
            {payload.vacantSingletonRanks.map((rank) => {
              const slot = findExecutiveSlotForRank(payload.executiveRoles, rank);
              if (!slot) return null;
              return (
                <VacantSingletonColumn
                  key={`vacant-${rank}`}
                  rank={rank}
                  slot={slot}
                  executiveRoles={payload.executiveRoles}
                  assignEmployeeId={assignDraft[slot.rankCode] ?? ''}
                  onAssignEmployeeChange={(value) =>
                    setAssignDraft((prev) => ({ ...prev, [slot.rankCode]: value }))
                  }
                  onAssign={() => void handleAssign(slot)}
                  busy={busyRank === slot.rankCode}
                />
              );
            })}
            {payload.staff.map((person) => {
              const rank = (person.rank ?? '').trim().toUpperCase();
              const singletonSlot =
                isCommandCenterSingletonRank(rank)
                  ? findExecutiveSlotForRank(payload.executiveRoles, rank) ?? null
                  : null;
              return (
                <StaffCommandCenterColumn
                  key={person.id}
                  person={person}
                  singletonSlot={singletonSlot}
                  sessionEmployeeId={payload.sessionEmployeeId}
                  sessionRole={payload.sessionRole}
                  recoveryEmailDraft={recoveryEmails[person.id] ?? ''}
                  onRecoveryEmailChange={(value) =>
                    setRecoveryEmails((prev) => ({ ...prev, [person.id]: value }))
                  }
                  otpGenerating={generatingId === person.id}
                  otpResettingAccess={resettingId === person.id}
                  otpResettingTwoFactor={resettingTwoFactorId === person.id}
                  otpUnlocking={unlockingId === person.id}
                  anyOtpBusy={anyOtpBusy}
                  onGenerateOtp={() => void handleGenerateOtp(person)}
                  onResetAccess={() => void handleResetAccess(person)}
                  onUnlockUsername={() => void handleUnlockUsername(person)}
                  onResetTwoFactor={() => void handleResetTwoFactor(person)}
                  getAccessLevel={(portalId) => getCell(person.id, portalId)}
                  onAccessChange={(portalId, level) =>
                    setCell(person.id, portalId, level)
                  }
                />
              );
            })}
          </div>
        )}
      </div>

      {!loading && hasColumns && payload ? (
        <StaffCommandCenterRbacSaveFooter
          saving={rbacSaving}
          saved={rbacSaved}
          error={rbacError}
          disabled={payload.staff.length === 0}
          onSave={() => void handleSaveRbac()}
        />
      ) : null}
    </ExecutiveGlassCard>

    <SectorAssignmentsBoard />
    </>
  );
}
