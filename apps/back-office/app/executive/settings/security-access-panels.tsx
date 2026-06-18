'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  User,
  Save,
  CheckCircle2,
  AlertTriangle,
  Shield,
  Lock,
  Monitor,
  MapPin,
  CircleDot,
  OctagonX,
  KeyRound,
  Timer,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Users,
  ChevronDown,
  Unlock,
  Clock,
  Info,
  Copy,
  RefreshCw,
} from 'lucide-react';
import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';
import { getRbacMatrixPayload, savePortalRbacMatrix } from './rbac-actions';
import type { HeadOfficePortalAuthStatus } from '../../../lib/head-office-portal-auth';
import { readDeviceGeolocationWithRetry } from '../../../lib/device-geolocation';
import {
  provisionHeadOfficePortalOtpAction,
  resetHeadOfficePortalAccessAction,
  resetHeadOfficeTwoFactorAction,
} from './portal-auth-actions';
import PortalOtpCountdown from './PortalOtpCountdown';
import { HO_PORTAL_OTP_LIFETIME_MS } from '../../../lib/head-office-portal-password';
import {
  isSystemLockedRank,
  makeBlankPortalRbacRow,
  PORTAL_RBAC_PORTALS,
  type HeadOfficeRbacStaffRow,
  type PortalAccessLevel,
  type PortalRbacMatrix,
} from '../../../../../packages/portal-rbac';
import type { SettingsSectionAudit } from './settings-traceability-actions';
import { SettingsTraceability } from './settings-section-ui';

const inputCls =
  'w-full rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all';
const labelCls = 'mb-1 block text-sm font-bold uppercase tracking-wide text-slate-700';

// ─── Security & Sessions ──────────────────────────────────────────────────────

type VaultRole = 'MD' | 'OD' | 'Exec Admin';
type SessionStatus = 'ONLINE' | 'IDLE';

interface VaultSession {
  id: string;
  user: string;
  role: VaultRole | string;
  roleLabel: string;
  device: string;
  ipAddress: string;
  location: string;
  lastActive: string;
  status: SessionStatus;
  isCurrent: boolean;
}

const ROLE_META: Record<VaultRole, { label: string; cls: string }> = {
  MD:         { label: 'MD',         cls: 'border-indigo-200/80 bg-indigo-50/80 text-indigo-800' },
  OD:         { label: 'OD',         cls: 'border-sky-200/80 bg-sky-50/80 text-sky-800' },
  'Exec Admin': { label: 'Exec Admin', cls: 'border-slate-200/80 bg-slate-100/80 text-slate-700' },
};

function resolveSessionRoleMeta(session: VaultSession) {
  const normalized = String(session.role ?? '').trim().toUpperCase();
  if (normalized === 'MD') return { label: session.roleLabel || 'MD', cls: ROLE_META.MD.cls };
  if (normalized === 'OD') return { label: session.roleLabel || 'OD', cls: ROLE_META.OD.cls };
  return {
    label: session.roleLabel || 'Exec Admin',
    cls: ROLE_META['Exec Admin'].cls,
  };
}

function SessionStatusBadge({ status }: { status: SessionStatus }) {
  if (status === 'ONLINE') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-3 py-1 text-sm font-black uppercase tracking-wider text-emerald-800">
        <CircleDot className="h-3 w-3 text-emerald-500 animate-pulse" />
        Online
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50/80 px-3 py-1 text-sm font-black uppercase tracking-wider text-amber-800">
      <Clock className="h-3 w-3" />
      Idle
    </span>
  );
}

function SecuritySessionsPanel() {
  const [sessions, setSessions] = useState<VaultSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const [terminatingOthers, setTerminatingOthers] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { listActiveVaultSessions } = await import(
        '../../actions/vault-session-actions'
      );
      const result = await listActiveVaultSessions();
      if ('error' in result) {
        setLoadError(result.error);
        setSessions([]);
        return;
      }
      setSessions(result.sessions);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Failed to load vault sessions.',
      );
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const revokeSession = async (id: string) => {
    setActionError(null);
    setBusySessionId(id);
    try {
      const { revokeVaultSessionAction } = await import(
        '../../actions/vault-session-actions'
      );
      const result = await revokeVaultSessionAction(id);
      if ('error' in result) {
        setActionError(result.error);
        return;
      }
      showToast('Vault session revoked — user signed out remotely.');
      await loadSessions();
    } finally {
      setBusySessionId(null);
    }
  };

  const terminateAllOthers = async () => {
    setActionError(null);
    setTerminatingOthers(true);
    try {
      const { revokeAllOtherVaultSessionsAction } = await import(
        '../../actions/vault-session-actions'
      );
      const result = await revokeAllOtherVaultSessionsAction();
      if ('error' in result) {
        setActionError(result.error);
        return;
      }
      showToast(
        result.revokedCount === 0
          ? 'No other vault sessions were active.'
          : `Terminated ${result.revokedCount} other vault session${result.revokedCount === 1 ? '' : 's'}.`,
      );
      await loadSessions();
    } finally {
      setTerminatingOthers(false);
    }
  };

  const otherCount = sessions.filter((s) => !s.isCurrent).length;

  return (
    <ExecutiveGlassCard className="overflow-hidden">
      {toast && (
        <div className="border-b border-emerald-200/80 bg-emerald-50/80 px-5 py-2.5">
          <p className="flex items-center gap-2 text-sm font-bold text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {toast}
          </p>
        </div>
      )}

      {actionError && (
        <div className="border-b border-rose-200/80 bg-rose-50/80 px-5 py-2.5">
          <p className="flex items-center gap-2 text-sm font-bold text-rose-800">
            <AlertTriangle className="h-3.5 w-3.5" />
            {actionError}
          </p>
        </div>
      )}

      <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-rose-200/80 bg-rose-50/80">
              <Shield className="h-5 w-5 text-rose-700" />
            </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Active Vault Sessions</h3>
                <p className="text-sm font-medium text-slate-600">
                  Monitor executive portal logins and revoke unauthorized or stale access in real time.
                </p>
                <SettingsTraceability />
              </div>
          </div>

          <button
            type="button"
            onClick={() => void terminateAllOthers()}
            disabled={otherCount === 0 || terminatingOthers || loading}
            className={`flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-black uppercase tracking-widest shadow-sm transition-all ${
              otherCount === 0 || terminatingOthers || loading
                ? 'cursor-not-allowed border-slate-200/80 bg-slate-100/80 text-slate-600'
                : 'border-rose-300/80 bg-rose-600 text-white shadow-rose-600/25 hover:bg-rose-500'
            }`}
          >
            <Lock className="h-3.5 w-3.5" />
            {terminatingOthers ? 'Terminating…' : 'Terminate All Other Sessions'}
          </button>
        </div>
      </div>

      <div className="hidden overflow-x-auto md:block">
        {loading ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            Loading active vault sessions…
          </div>
        ) : loadError ? (
          <div className="px-6 py-10 text-center text-sm font-semibold text-rose-700">
            {loadError}
          </div>
        ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200/80 bg-slate-50/60 text-sm font-bold uppercase tracking-widest text-slate-500">
            <tr>
              <th className="px-6 py-3">User</th>
              <th className="px-6 py-3">Device</th>
              <th className="px-6 py-3">IP Address &amp; Location</th>
              <th className="px-6 py-3">Last Active</th>
              <th className="px-6 py-3 text-center">Status</th>
              <th className="px-6 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/60">
            {sessions.map((session) => {
              const roleMeta = resolveSessionRoleMeta(session);
              return (
                <tr
                  key={session.id}
                  className={`transition-colors ${
                    session.isCurrent ? 'bg-emerald-50/30 hover:bg-emerald-50/50' : 'hover:bg-white/40'
                  }`}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-white/80">
                        <User className="h-4 w-4 text-slate-500" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">{session.user}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-sm font-black ${roleMeta.cls}`}>
                            {roleMeta.label}
                          </span>
                          {session.isCurrent && (
                            <span className="inline-flex rounded-full border border-emerald-200/80 bg-emerald-100/80 px-2 py-0.5 text-sm font-black text-emerald-800">
                              Current Session
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Monitor className="h-3.5 w-3.5 flex-shrink-0 text-slate-600" />
                      <span className="text-sm font-semibold text-slate-700">{session.device}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-600" />
                      <div>
                        <p className="font-mono text-sm font-semibold text-slate-800">{session.ipAddress}</p>
                        <p className="text-sm text-slate-500">{session.location}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-semibold text-slate-700">{session.lastActive}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <SessionStatusBadge status={session.status} />
                  </td>
                  <td className="px-6 py-4 text-right">
                    {session.isCurrent ? (
                      <span className="text-sm font-semibold text-emerald-700">Protected</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void revokeSession(session.id)}
                        disabled={busySessionId === session.id}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300/80 bg-rose-50/80 px-3 py-1.5 text-sm font-black uppercase tracking-wider text-rose-800 transition-all hover:bg-rose-100/80 hover:shadow-sm disabled:opacity-50"
                      >
                        <OctagonX className="h-3 w-3" />
                        {busySessionId === session.id ? 'Revoking…' : 'Revoke Access'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        )}
      </div>

      {/* Mobile card list */}
      <div className="space-y-3 p-4 md:hidden">
        {loading ? (
          <p className="text-center text-sm text-slate-500">Loading active vault sessions…</p>
        ) : loadError ? (
          <p className="text-center text-sm font-semibold text-rose-700">{loadError}</p>
        ) : sessions.length === 0 ? (
          <p className="text-center text-sm text-slate-500">No active vault sessions.</p>
        ) : (
          sessions.map((session) => {
            const roleMeta = resolveSessionRoleMeta(session);
            return (
              <div
                key={session.id}
                className={`rounded-2xl border p-4 shadow-sm ${
                  session.isCurrent
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900">{session.user}</p>
                    <p className="mt-1 text-xs text-slate-500">{session.device}</p>
                  </div>
                  <SessionStatusBadge status={session.status} />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black ${roleMeta.cls}`}>
                    {roleMeta.label}
                  </span>
                  {session.isCurrent ? (
                    <span className="inline-flex rounded-full border border-emerald-200/80 bg-emerald-100/80 px-2 py-0.5 text-[10px] font-black text-emerald-800">
                      Current
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 space-y-1 text-xs text-slate-600">
                  <p className="font-mono font-semibold text-slate-800">{session.ipAddress}</p>
                  <p>{session.location}</p>
                  <p>Last active: {session.lastActive}</p>
                </div>
                {!session.isCurrent ? (
                  <button
                    type="button"
                    onClick={() => void revokeSession(session.id)}
                    disabled={busySessionId === session.id}
                    className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-300/80 bg-rose-50/80 px-3 py-2 text-xs font-black uppercase tracking-wider text-rose-800 disabled:opacity-50"
                  >
                    <OctagonX className="h-3 w-3" />
                    {busySessionId === session.id ? 'Revoking…' : 'Revoke Access'}
                  </button>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {!loading && !loadError && sessions.length === 0 && (
        <div className="hidden px-6 py-10 text-center text-sm text-slate-500 md:block">No active vault sessions.</div>
      )}

      <div className="border-t border-slate-200/80 bg-slate-50/60 px-6 py-3">
        <p className="text-sm text-slate-500">
          {sessions.length} active session{sessions.length !== 1 ? 's' : ''} ·{' '}
          {sessions.filter((s) => s.status === 'ONLINE').length} online ·{' '}
          Revoked sessions are immediately invalidated and require re-authentication.
        </p>
      </div>
    </ExecutiveGlassCard>
  );
}

function VaultPinConfigPanel() {
  const [idleTimeout,    setIdleTimeout]    = useState(30);
  const [autoLockEnabled, setAutoLockEnabled] = useState(true);
  const [policyLoading,  setPolicyLoading]  = useState(true);
  const [mfaCode,        setMfaCode]        = useState('');
  const [newPin,         setNewPin]         = useState('');
  const [confirmPin,     setConfirmPin]     = useState('');
  const [mfaError,       setMfaError]       = useState(false);
  const [pinMismatch,    setPinMismatch]    = useState(false);
  const [saved,          setSaved]          = useState(false);
  const [timeoutSaved,   setTimeoutSaved]   = useState(false);
  const [pinSaving,      setPinSaving]      = useState(false);
  const [pinSaveError,   setPinSaveError]   = useState('');

  const pinReady =
    mfaCode.length === 6 &&
    newPin.length === 4 &&
    confirmPin.length === 4;

  const handleUpdatePin = async () => {
    setMfaError(false);
    setPinMismatch(false);
    setPinSaveError('');

    if (newPin !== confirmPin) {
      setPinMismatch(true);
      setConfirmPin('');
      return;
    }

    setPinSaving(true);
    try {
      const { saveVaultMasterPin } = await import(
        '../../actions/vault-session-actions'
      );
      const result = await saveVaultMasterPin(mfaCode, newPin, confirmPin);
      if (!result.ok) {
        if (result.error.toLowerCase().includes('mfa')) {
          setMfaError(true);
          setMfaCode('');
        } else if (result.error.toLowerCase().includes('match')) {
          setPinMismatch(true);
          setConfirmPin('');
        } else {
          setPinSaveError(result.error);
        }
        return;
      }

      setSaved(true);
      setMfaCode('');
      setNewPin('');
      setConfirmPin('');
      window.dispatchEvent(new Event('executive-vault-pin-updated'));
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setPinSaveError(
        err instanceof Error ? err.message : 'Failed to update vault PIN.',
      );
    } finally {
      setPinSaving(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getVaultSessionPolicy } = await import(
          '../../actions/vault-session-actions'
        );
        const policy = await getVaultSessionPolicy();
        if (cancelled) return;
        setIdleTimeout(policy.idleTimeoutMinutes);
        setAutoLockEnabled(policy.autoLockEnabled);
      } finally {
        if (!cancelled) setPolicyLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleTimeoutSave = async () => {
    try {
      const { saveVaultSessionPolicy } = await import(
        '../../actions/vault-session-actions'
      );
      await saveVaultSessionPolicy(idleTimeout, autoLockEnabled);
      window.dispatchEvent(new Event('executive-vault-policy-updated'));
      setTimeoutSaved(true);
      setTimeout(() => setTimeoutSaved(false), 2500);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save vault timeout.');
    }
  };

  return (
    <div id="vault-pin">
    <ExecutiveGlassCard className="overflow-hidden">
      {/* Card header */}
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-indigo-200/80 bg-indigo-50/80">
            <KeyRound className="h-5 w-5 text-indigo-700" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">
              Vault PIN Configuration
            </h3>
            <p className="text-sm font-medium text-slate-600">
              Control idle auto-lock behaviour and update the master vault PIN with MFA verification
            </p>
            <SettingsTraceability />
          </div>
        </div>
      </div>

      <div className="divide-y divide-slate-200/60">

        {/* ── Idle Auto-Lock Timeout ── */}
        <div className="px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-amber-200/80 bg-amber-50/80">
                <Timer className="h-4 w-4 text-amber-700" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">Idle Auto-Lock Timeout</p>
                <p className="mt-0.5 text-sm text-slate-500">
                  The vault will soft-lock after this many minutes of inactivity. Any mouse or keyboard event then triggers the PIN screen.
                </p>
              </div>
            </div>
            {timeoutSaved && (
              <span className="flex items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-1.5 text-sm font-bold text-emerald-800">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Timeout updated
              </span>
            )}
          </div>

          {/* ── Enable Auto-Lock master toggle ── */}
          <div className="mt-4 flex flex-col gap-1.5">
            <div className="flex items-center justify-between rounded-xl border border-slate-200/70 bg-slate-50/60 px-4 py-3">
              <div className="flex items-center gap-2.5">
                {autoLockEnabled
                  ? <ShieldCheck className="h-4 w-4 text-indigo-600 flex-shrink-0" />
                  : <Unlock className="h-4 w-4 text-rose-500 flex-shrink-0" />
                }
                <span className="text-sm font-black uppercase tracking-wider text-slate-700">
                  Enable Auto-Lock
                </span>
              </div>
              {/* Toggle pill */}
              <button
                type="button"
                role="switch"
                aria-checked={autoLockEnabled}
                onClick={() => setAutoLockEnabled((v) => !v)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${
                  autoLockEnabled
                    ? 'border-indigo-300/80 bg-indigo-600'
                    : 'border-slate-300/80 bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ${
                    autoLockEnabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Warning when auto-lock is disabled */}
            {!autoLockEnabled && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-300/70 bg-rose-50/70 px-3.5 py-2.5">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-rose-600" />
                <p className="text-sm font-semibold leading-snug text-rose-700">
                  Warning: Disabling auto-lock leaves the vault permanently open while unattended.
                </p>
              </div>
            )}
          </div>

          <div className={`mt-4 flex flex-wrap items-center gap-4 transition-opacity duration-200 ${autoLockEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none select-none'}`}>
            <div>
              <label className={`${labelCls} flex items-center gap-1.5`}>
                <Clock className="h-3 w-3 text-amber-600" />
                Idle Auto-Lock Timeout (Minutes)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={idleTimeout}
                  disabled={!autoLockEnabled}
                  onChange={(e) => setIdleTimeout(Math.max(1, Math.min(60, parseInt(e.target.value) || 1)))}
                  className="w-24 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-center text-sm font-black text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-all disabled:cursor-not-allowed"
                />
                <span className="text-sm font-semibold text-slate-500">
                  minute{idleTimeout !== 1 ? 's' : ''} of inactivity
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleTimeoutSave}
              disabled={!autoLockEnabled || policyLoading}
              className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50/80 px-4 py-2 text-sm font-black uppercase tracking-widest text-amber-800 transition-all hover:bg-amber-100/80 hover:shadow-sm disabled:cursor-not-allowed"
            >
              <Save className="h-3.5 w-3.5" />
              Apply Timeout
            </button>
          </div>

          {autoLockEnabled && (
            <div className={`mt-4 flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold ${
              idleTimeout <= 2
                ? 'border-rose-200/80 bg-rose-50/60 text-rose-800'
                : idleTimeout <= 5
                  ? 'border-amber-200/80 bg-amber-50/60 text-amber-800'
                  : 'border-slate-200/60 bg-slate-50/60 text-slate-600'
            }`}>
              <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0" />
              Vault will soft-lock after <strong className="mx-1">{idleTimeout} min</strong> of inactivity.
              {idleTimeout <= 2 && ' High-security mode — very aggressive lockout.'}
              {idleTimeout > 2 && idleTimeout <= 5 && ' Recommended range for executive sessions.'}
              {idleTimeout > 5 && ' Recommended range for executive sessions.'}
            </div>
          )}
        </div>

        {/* ── Change Master PIN ── */}
        <div className="px-6 py-5">
          <div className="mb-5 flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-rose-200/80 bg-rose-50/80">
              <Lock className="h-4 w-4 text-rose-700" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Change Master PIN</p>
              <p className="mt-0.5 text-sm text-slate-500">
                MFA verification is required before setting a new vault PIN. The current PIN is used for idle-lock resumption.
              </p>
            </div>
          </div>

          {saved && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-4 py-3 text-sm font-bold text-emerald-800">
              <ShieldCheck className="h-4 w-4 flex-shrink-0" />
              Vault PIN updated successfully. New PIN is now active.
            </div>
          )}
          {pinSaveError && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200/80 bg-rose-50/80 px-4 py-3 text-sm font-bold text-rose-800">
              <ShieldAlert className="h-4 w-4 flex-shrink-0" />
              {pinSaveError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">

            {/* MFA Code */}
            <div>
              <label className={`${labelCls} flex items-center gap-1.5`}>
                <ShieldCheck className="h-3 w-3 text-indigo-600" />
                Current Google Auth Code (MFA)
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => {
                  setMfaError(false);
                  setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                }}
                placeholder="6-digit code"
                className={`${inputCls} font-mono tracking-widest ${
                  mfaError ? 'border-rose-300/80 ring-2 ring-rose-500/20' : ''
                }`}
              />
              {mfaError && (
                <p className="mt-1 flex items-center gap-1 text-sm font-bold text-rose-700">
                  <ShieldAlert className="h-3 w-3" />
                  Invalid MFA code
                </p>
              )}
            </div>

            {/* New PIN */}
            <div>
              <label className={`${labelCls} flex items-center gap-1.5`}>
                <KeyRound className="h-3 w-3 text-slate-500" />
                New 4-Digit PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                className={`${inputCls} text-center tracking-[0.4em]`}
              />
              {newPin.length > 0 && newPin.length < 4 && (
                <p className="mt-1 text-sm text-slate-600">{4 - newPin.length} digit{4 - newPin.length !== 1 ? 's' : ''} remaining</p>
              )}
            </div>

            {/* Confirm PIN */}
            <div>
              <label className={`${labelCls} flex items-center gap-1.5`}>
                <KeyRound className="h-3 w-3 text-slate-500" />
                Confirm New PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={confirmPin}
                onChange={(e) => {
                  setPinMismatch(false);
                  setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                }}
                placeholder="••••"
                className={`${inputCls} text-center tracking-[0.4em] ${
                  pinMismatch ? 'border-rose-300/80 ring-2 ring-rose-500/20' : ''
                }`}
              />
              {pinMismatch && (
                <p className="mt-1 flex items-center gap-1 text-sm font-bold text-rose-700">
                  <ShieldAlert className="h-3 w-3" />
                  PINs do not match
                </p>
              )}
              {confirmPin.length === 4 && newPin.length === 4 && confirmPin === newPin && !pinMismatch && (
                <p className="mt-1 flex items-center gap-1 text-sm font-bold text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" />
                  PINs match
                </p>
              )}
            </div>
          </div>

          {/* Security advisory */}
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-slate-200/60 bg-slate-50/60 px-3 py-2.5 text-sm text-slate-600">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-indigo-500" />
            <span>
              Your new PIN will replace the current vault PIN immediately. Avoid simple sequences (e.g. 1234, 0000).
              The MFA code must be verified first — this action is logged to the vault audit trail.
            </span>
          </div>

          {/* Update PIN button */}
          <div className="mt-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-500">
              <Lock className="h-3 w-3" />
              MFA-gated · Audit logged · Cannot be undone without re-verification
            </div>
            <button
              type="button"
              onClick={handleUpdatePin}
              disabled={!pinReady || pinSaving}
              className={`flex items-center gap-2 rounded-2xl px-6 py-2.5 text-sm font-black uppercase tracking-widest text-white shadow-lg transition-all ${
                pinReady && !pinSaving
                  ? 'bg-slate-900 shadow-slate-900/20 hover:bg-slate-700'
                  : 'cursor-not-allowed bg-slate-300 shadow-none'
              }`}
            >
              <Lock className="h-4 w-4" />
              {pinSaving ? 'Updating…' : 'Update PIN'}
            </button>
          </div>
        </div>
      </div>
    </ExecutiveGlassCard>
    </div>
  );
}

interface RbacStaffRow {
  id: string;
  label: string;
  sub: string;
  email: string | null;
  status: string;
  isLocked: boolean;
  portalAuth: HeadOfficePortalAuthStatus;
}

function formatPortalOtpAuditTime(iso: string | null): string {
  if (!iso) return 'Never';
  try {
    return new Intl.DateTimeFormat('en-LK', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const RBAC_PORTALS = PORTAL_RBAC_PORTALS;

const PORTAL_SECTION_SPANS = (() => {
  const order: string[] = [];
  const counts: Record<string, number> = {};
  RBAC_PORTALS.forEach((p) => {
    if (!counts[p.section]) { order.push(p.section); counts[p.section] = 0; }
    counts[p.section]++;
  });
  return order.map((s) => ({ label: s, count: counts[s] }));
})();

function staffRowsFromPayload(
  staff: HeadOfficeRbacStaffRow[],
  portalAuthByEmployeeId: Record<string, HeadOfficePortalAuthStatus>,
): RbacStaffRow[] {
  return staff.map((person) => ({
    id: person.id,
    label: person.fullName,
    sub: person.rank ? `${person.rank} · Head Office` : 'Head Office · No rank set',
    email: person.email,
    status: person.status,
    isLocked: isSystemLockedRank(person.rank),
    portalAuth: portalAuthByEmployeeId[person.id] ?? {
      isProvisioned: false,
      isActive: false,
      twoFactorEnabled: false,
      lastOtpProvisionedAt: null,
      lastOtpProvisionedByName: null,
      lastOtpProvisionedLocationLabel: null,
    },
  }));
}

const ACCESS_META: Record<PortalAccessLevel, { label: string; cls: string; dotCls: string; selectCls: string }> = {
  FULL: {
    label:     'Full Access',
    cls:       'border-emerald-200/80 bg-emerald-50/80 text-emerald-900',
    dotCls:    'bg-emerald-500',
    selectCls: 'border-emerald-200/80 bg-emerald-50/80 text-emerald-900 focus:ring-emerald-500/40',
  },
  READ: {
    label:     'Read Only',
    cls:       'border-amber-200/80 bg-amber-50/80 text-amber-900',
    dotCls:    'bg-amber-400',
    selectCls: 'border-amber-200/80 bg-amber-50/80 text-amber-900 focus:ring-amber-500/40',
  },
  NONE: {
    label:     'No Access',
    cls:       'border-slate-200/80 bg-slate-100/80 text-slate-500',
    dotCls:    'bg-slate-300',
    selectCls: 'border-slate-200/80 bg-slate-50/80 text-slate-500 focus:ring-slate-400/40',
  },
};

function RbacMatrixPanel({
  audit,
}: {
  audit?: SettingsSectionAudit;
}) {
  const [staffRows, setStaffRows] = useState<RbacStaffRow[]>([]);
  const [matrix, setMatrix] = useState<PortalRbacMatrix>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resettingTwoFactorId, setResettingTwoFactorId] = useState<string | null>(null);
  const [generatedOtp, setGeneratedOtp] = useState<{
    otp: string;
    staffName: string;
    email: string;
    expiresAt: number;
    provisionedBy: string;
    provisionedWhere: string;
  } | null>(null);
  const [otpCopied, setOtpCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const payload = await getRbacMatrixPayload();
        if (cancelled) return;
        setStaffRows(staffRowsFromPayload(payload.staff, payload.portalAuthByEmployeeId));
        setMatrix(payload.matrix);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load staff permissions');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const getCell = (employeeId: string, portalId: string): PortalAccessLevel =>
    matrix[employeeId]?.[portalId] ?? 'NONE';

  const setCell = (employeeId: string, portalId: string, val: PortalAccessLevel) =>
    setMatrix((prev) => ({
      ...prev,
      [employeeId]: { ...(prev[employeeId] ?? makeBlankPortalRbacRow()), [portalId]: val },
    }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const result = await savePortalRbacMatrix(matrix);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Failed to save permissions');
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleGenerateOtp = async (person: RbacStaffRow) => {
    setAuthError(null);
    setGeneratedOtp(null);
    setGeneratingId(person.id);

    const geo = await readDeviceGeolocationWithRetry().catch(() => null);
    const lat = geo && geo.ok ? geo.latitude : null;
    const lng = geo && geo.ok ? geo.longitude : null;

    const result = await provisionHeadOfficePortalOtpAction(person.id, lat, lng);
    setGeneratingId(null);
    if (result.error) {
      setAuthError(result.error);
      return;
    }
    if (result.success && result.otp) {
      setGeneratedOtp({
        otp: result.otp,
        staffName: result.staffName ?? person.label,
        email: result.email ?? person.email ?? '—',
        expiresAt: result.expiresAt ?? Date.now() + HO_PORTAL_OTP_LIFETIME_MS,
        provisionedBy: result.provisionedBy ?? 'Executive',
        provisionedWhere: result.provisionedWhere ?? '—',
      });
      setStaffRows((rows) =>
        rows.map((row) =>
          row.id === person.id
            ? {
                ...row,
                portalAuth: {
                  ...row.portalAuth,
                  isProvisioned: true,
                  isActive: true,
                  twoFactorEnabled: false,
                  lastOtpProvisionedAt: new Date().toISOString(),
                  lastOtpProvisionedByName: result.provisionedBy ?? 'Executive',
                  lastOtpProvisionedLocationLabel: result.provisionedWhere ?? '—',
                },
              }
            : row,
        ),
      );
    }
  };

  const handleResetAccess = async (person: RbacStaffRow) => {
    setAuthError(null);
    setResettingId(person.id);
    const result = await resetHeadOfficePortalAccessAction(person.id);
    setResettingId(null);
    if (result.error) {
      setAuthError(result.error);
      return;
    }
    setGeneratedOtp(null);
  };

  const handleResetTwoFactor = async (person: RbacStaffRow) => {
    setAuthError(null);
    setResettingTwoFactorId(person.id);
    const result = await resetHeadOfficeTwoFactorAction(person.id);
    setResettingTwoFactorId(null);
    if (result.error) {
      setAuthError(result.error);
      return;
    }
    setStaffRows((rows) =>
      rows.map((row) =>
        row.id === person.id
          ? {
              ...row,
              portalAuth: {
                ...row.portalAuth,
                twoFactorEnabled: false,
              },
            }
          : row,
      ),
    );
  };

  const copyGeneratedOtp = () => {
    if (!generatedOtp) return;
    navigator.clipboard.writeText(generatedOtp.otp);
    setOtpCopied(true);
    setTimeout(() => setOtpCopied(false), 2000);
  };

  const staffMemberCell = (person: RbacStaffRow) => (
    <div className="flex items-center gap-3">
      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border ${person.isLocked ? 'border-rose-200/80 bg-rose-50/80' : 'border-violet-200/80 bg-violet-50/80'}`}>
        {person.isLocked
          ? <Lock className="h-3.5 w-3.5 text-rose-600" />
          : <User className="h-3.5 w-3.5 text-violet-700" />
        }
      </div>
      <div>
        <p className="text-sm font-black text-slate-900">{person.label}</p>
        <p className="text-[11px] text-slate-500">{person.sub}</p>
        {person.email ? (
          <p className="text-[11px] text-slate-400">{person.email}</p>
        ) : null}
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {person.status !== 'ACTIVE' && (
            <span className="inline-flex rounded-full border border-amber-200/80 bg-amber-50/80 px-1.5 py-px text-[9px] font-black uppercase tracking-wider text-amber-800">
              {person.status}
            </span>
          )}
          {person.isLocked && (
            <span className="inline-block rounded-full bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-600 border border-rose-200/60">
              System locked
            </span>
          )}
        </div>
      </div>
    </div>
  );

  const emptyStaffMessage = (
  <>
    <p className="font-bold text-slate-800">No Head Office corporate staff yet</p>
    <p className="mt-1">
      Add employees in HR → MNR, set their corporate group to <strong>Head Office</strong>, and assign a Head Office rank (MD, OD, FM, HR, EA, OM). Resigned and terminated records are excluded.
    </p>
  </>
  );

  return (
    <div className="space-y-6">
      {/* Portal OTP — separate from permission matrix */}
      <ExecutiveGlassCard className="overflow-hidden">
        <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-violet-200/80 bg-violet-50/80">
              <KeyRound className="h-5 w-5 text-violet-700" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Portal OTP</h3>
              <p className="text-sm font-medium text-slate-600">
                Generate a one-time password for HQ email sign-in (valid 1 minute). Staff set a permanent password (15+ chars), then bind 2FA. Reset access immediately revokes login.
              </p>
            </div>
          </div>
        </div>

        {authError ? (
          <div className="border-b border-rose-100 bg-rose-50 px-6 py-3 text-sm font-semibold text-rose-800">
            {authError}
          </div>
        ) : null}

        {generatedOtp ? (
          <div className="border-b border-violet-100 bg-violet-50 px-6 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-violet-700" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-violet-900">
                  OTP for {generatedOtp.staffName} ({generatedOtp.email})
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <span className="font-mono text-3xl font-black tracking-[0.25em] text-violet-700">
                    {generatedOtp.otp}
                  </span>
                  <button
                    type="button"
                    onClick={copyGeneratedOtp}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs font-bold text-violet-900"
                  >
                    {otpCopied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {otpCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="mt-2 text-xs font-semibold text-violet-800">
                  Issued by {generatedOtp.provisionedBy} from {generatedOtp.provisionedWhere}.
                  Staff sign in with work email + OTP, set a password, then bind 2FA.
                </p>
                <PortalOtpCountdown
                  expiresAt={generatedOtp.expiresAt}
                  onExpired={() => setGeneratedOtp(null)}
                />
              </div>
            </div>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200/80 bg-slate-50/60">
              <tr>
                <th className="w-52 px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500">
                  Staff Member
                </th>
                <th className="w-28 px-3 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500 border-l border-slate-200/40">
                  2FA
                </th>
                <th className="min-w-[10rem] px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 border-l border-slate-200/40">
                  Last OTP
                </th>
                <th className="w-48 px-3 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500 border-l border-slate-200/40">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-sm font-medium text-slate-500">
                    Loading Head Office staff from MNR…
                  </td>
                </tr>
              ) : staffRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-sm text-slate-600">
                    {emptyStaffMessage}
                  </td>
                </tr>
              ) : (
                staffRows.map((person, ri) => (
                  <tr
                    key={person.id}
                    className={`transition-colors hover:bg-white/40 ${ri % 2 === 0 ? 'bg-white/20' : ''}`}
                  >
                    <td className="px-6 py-4">
                      {staffMemberCell(person)}
                    </td>
                    <td className="px-3 py-3 text-center border-l border-slate-200/40">
                      <span
                        className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[10px] font-black uppercase tracking-wider ${
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
                        {person.portalAuth.twoFactorEnabled ? 'On' : 'Off'}
                      </span>
                    </td>
                    <td className="px-3 py-3 border-l border-slate-200/40">
                      <div className="text-[11px] leading-relaxed text-slate-600">
                        <p className="font-semibold text-slate-800">
                          {formatPortalOtpAuditTime(person.portalAuth.lastOtpProvisionedAt)}
                        </p>
                        {person.portalAuth.lastOtpProvisionedByName ? (
                          <p className="mt-1">
                            By {person.portalAuth.lastOtpProvisionedByName}
                          </p>
                        ) : null}
                        {person.portalAuth.lastOtpProvisionedLocationLabel ? (
                          <p className="mt-0.5 text-slate-500">
                            @ {person.portalAuth.lastOtpProvisionedLocationLabel}
                          </p>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3 border-l border-slate-200/40">
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => handleGenerateOtp(person)}
                          disabled={!person.email || generatingId === person.id || resettingId === person.id || resettingTwoFactorId === person.id}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-2.5 py-2 text-[10px] font-black uppercase tracking-wider text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <RefreshCw className={`h-3 w-3 ${generatingId === person.id ? 'animate-spin' : ''}`} />
                          {generatingId === person.id ? '…' : 'Generate OTP'}
                        </button>
                        {person.portalAuth.twoFactorEnabled ? (
                          <button
                            type="button"
                            onClick={() => handleResetTwoFactor(person)}
                            disabled={!person.email || generatingId === person.id || resettingId === person.id || resettingTwoFactorId === person.id}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] font-black uppercase tracking-wider text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Smartphone className={`h-3 w-3 ${resettingTwoFactorId === person.id ? 'animate-pulse' : ''}`} />
                            {resettingTwoFactorId === person.id ? '…' : 'Reset 2FA'}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleResetAccess(person)}
                          disabled={!person.email || generatingId === person.id || resettingId === person.id || resettingTwoFactorId === person.id}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[10px] font-black uppercase tracking-wider text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <KeyRound className="h-3 w-3" />
                          {resettingId === person.id ? '…' : 'Reset access'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </ExecutiveGlassCard>

      {/* Staff portal permissions */}
      <ExecutiveGlassCard className="overflow-hidden">
        <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-violet-200/80 bg-violet-50/80">
                <Users className="h-5 w-5 text-violet-700" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  Role-Based Access Control Matrix
                </h3>
                <p className="text-sm font-medium text-slate-600">
                  Head Office staff added in HR → MNR appear here automatically. Set portal access per module below.
                </p>
                <SettingsTraceability sectionId="portalRbac" audit={audit} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              {error && (
                <span className="rounded-xl border border-rose-200/80 bg-rose-50/80 px-3 py-1.5 text-sm font-bold text-rose-800">
                  {error}
                </span>
              )}
              {saved && (
                <span className="flex items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-1.5 text-sm font-bold text-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Permissions saved
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="border-b border-slate-200/60 bg-white/30 px-6 py-3">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sm font-bold uppercase tracking-widest text-slate-600">Access Levels:</span>
            {(Object.entries(ACCESS_META) as [PortalAccessLevel, typeof ACCESS_META[PortalAccessLevel]][]).map(([key, meta]) => (
              <span
                key={key}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-black uppercase tracking-wider ${meta.cls}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${meta.dotCls}`} />
                {meta.label}
              </span>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200/80 bg-slate-50/60">
              <tr className="border-b border-slate-100/80">
                <th className="w-52 px-6 py-2" />
                {PORTAL_SECTION_SPANS.map(({ label, count }) => (
                  <th
                    key={label}
                    colSpan={count}
                    className="px-4 py-2 text-center text-[9px] font-black uppercase tracking-widest text-slate-400 border-l border-slate-200/60"
                  >
                    {label}
                  </th>
                ))}
              </tr>
              <tr>
                <th className="w-52 px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500">
                  Staff Member
                </th>
                {RBAC_PORTALS.map((portal) => (
                  <th
                    key={portal.id}
                    className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500 border-l border-slate-200/40"
                  >
                    <div className="whitespace-nowrap">{portal.label}</div>
                    <div className="mt-0.5 text-[9px] font-semibold normal-case tracking-normal text-slate-400 whitespace-nowrap">
                      {portal.sub}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60">
              {loading ? (
                <tr>
                  <td colSpan={RBAC_PORTALS.length + 1} className="px-6 py-10 text-center text-sm font-medium text-slate-500">
                    Loading Head Office staff from MNR…
                  </td>
                </tr>
              ) : staffRows.length === 0 ? (
                <tr>
                  <td colSpan={RBAC_PORTALS.length + 1} className="px-6 py-10 text-center text-sm text-slate-600">
                    {emptyStaffMessage}
                  </td>
                </tr>
              ) : (
                staffRows.map((person, ri) => (
                  <tr
                    key={person.id}
                    className={`transition-colors hover:bg-white/40 ${ri % 2 === 0 ? 'bg-white/20' : ''}`}
                  >
                    <td className="px-6 py-4">
                      {staffMemberCell(person)}
                    </td>

                    {RBAC_PORTALS.map((portal) => {
                      const level = getCell(person.id, portal.id);
                      const meta = ACCESS_META[level];
                      return (
                        <td key={portal.id} className="px-3 py-3 text-center border-l border-slate-200/40">
                          {person.isLocked ? (
                            <span className={`inline-flex items-center gap-1 rounded-xl border px-2 py-1 text-[10px] font-black uppercase tracking-wider opacity-70 ${meta.cls}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${meta.dotCls}`} />
                              {level === 'FULL' ? 'Full' : level === 'READ' ? 'Read' : 'None'}
                            </span>
                          ) : (
                            <div className="relative inline-block">
                              <select
                                value={level}
                                onChange={(e) => setCell(person.id, portal.id, e.target.value as PortalAccessLevel)}
                                className={`appearance-none rounded-xl border py-1.5 pl-2.5 pr-6 text-[11px] font-black uppercase tracking-wider shadow-sm focus:outline-none focus:ring-2 transition-all cursor-pointer ${meta.selectCls}`}
                              >
                                <option value="FULL">Full Access</option>
                                <option value="READ">Read Only</option>
                                <option value="NONE">No Access</option>
                              </select>
                              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 opacity-60" />
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-200/60 bg-slate-50/60 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-2 text-sm text-slate-600 max-w-xl">
              <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-violet-500" />
              <span>
                Staff are sourced from MNR Head Office records. Permission changes are logged to the executive audit trail and enforced on the next sign-in.
                MD and OD access is system-locked. Operating Managers are locked to OM Command Center only. Territory Managers are locked to TM Command Center only.
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || loading || staffRows.length === 0}
                className="flex flex-shrink-0 items-center gap-2 rounded-2xl bg-violet-700 px-6 py-2.5 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-violet-700/25 hover:bg-violet-600 transition-all disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving…' : 'Commit Permissions'}
              </button>
            </div>
          </div>
        </div>
      </ExecutiveGlassCard>
    </div>
  );
}

export { SecuritySessionsPanel, VaultPinConfigPanel, RbacMatrixPanel };
