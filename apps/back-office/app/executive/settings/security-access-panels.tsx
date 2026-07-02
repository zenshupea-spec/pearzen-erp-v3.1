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
  ChevronLeft,
  ChevronRight,
  Unlock,
  Clock,
  Info,
  RefreshCw,
  Bell,
  ScrollText,
} from 'lucide-react';
import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';
import { ExecutivePageLoading } from '../../../components/executive/ExecutivePageChrome';
import { CVS_BRAND_CLASSES } from '../../../lib/cvs-brand-tokens';
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
  MD:         { label: 'MD',         cls: CVS_BRAND_CLASSES.rankBadge },
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
          <ExecutivePageLoading
            message="Loading active vault sessions…"
            className="min-h-[10rem] py-8"
          />
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
          <ExecutivePageLoading
            message="Loading active vault sessions…"
            className="min-h-[8rem] py-6"
          />
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
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-[color:var(--cvs-accent-muted)]/80 bg-[var(--cvs-accent-soft)]/80">
            <KeyRound className="h-5 w-5 text-[color:var(--cvs-accent)]" />
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
                  ? <ShieldCheck className="h-4 w-4 text-[color:var(--cvs-accent)] flex-shrink-0" />
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
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors duration-200 focus:outline-none focus:ring-2 ${CVS_BRAND_CLASSES.focusRing} ${
                  autoLockEnabled
                    ? 'border-[color:var(--cvs-accent-muted)]/80 bg-[color:var(--cvs-accent)]'
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
                <ShieldCheck className="h-3 w-3 text-[color:var(--cvs-accent)]" />
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
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[color:var(--cvs-accent)]" />
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
                  ? 'bg-[color:var(--cvs-accent)] shadow-[color:var(--cvs-glow)] hover:bg-[color:var(--cvs-accent-hover)]'
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


function formatPortalEventLabel(eventType: string): string {
  if (eventType === 'after_hours_login') return 'After-hours sign-in';
  if (eventType === 'shalom_direct_booking_confirmed') return 'Shalom direct booking';
  if (eventType === 'shalom_booking_received') return 'Shalom booking received';
  return eventType
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function AfterHoursLoginAlertsPanel() {
  const [enabled, setEnabled] = useState(true);
  const [startTime, setStartTime] = useState('17:00');
  const [endTime, setEndTime] = useState('08:00');
  const [notifyEmails, setNotifyEmails] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getPortalAfterHoursLoginAlertSettingsAction } = await import(
          './portal-after-hours-alert-actions'
        );
        const settings = await getPortalAfterHoursLoginAlertSettingsAction();
        if (cancelled) return;
        setEnabled(settings.enabled);
        setStartTime(settings.startTime);
        setEndTime(settings.endTime);
        setNotifyEmails(settings.notifyEmails.join('\n'));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load after-hours alert settings.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { savePortalAfterHoursLoginAlertSettingsAction } = await import(
        './portal-after-hours-alert-actions'
      );
      const result = await savePortalAfterHoursLoginAlertSettingsAction({
        enabled,
        startTime,
        endTime,
        notifyEmails: notifyEmails
          .split(/[\n,;]+/)
          .map((value) => value.trim())
          .filter(Boolean),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ExecutiveGlassCard className="overflow-hidden" id="after-hours-login-alerts">
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-amber-200/80 bg-amber-50/80">
            <Clock className="h-5 w-5 text-amber-700" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">After-Hours Login Alerts</h3>
            <p className="text-sm font-medium text-slate-600">
              Notify OD when HQ, OM, TM, or MD portal staff sign in outside office hours
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-5 px-6 py-5">
        {loading ? (
          <ExecutivePageLoading message="Loading alert settings…" className="min-h-[6rem] py-4" />
        ) : (
          <>
            <label className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-white/70 px-4 py-3">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-[color:var(--cvs-accent)] focus:ring-[color:var(--cvs-accent)]"
              />
              <span>
                <span className="block text-sm font-bold text-slate-800">
                  Enable after-hours login alerts
                </span>
                <span className="mt-1 block text-xs font-medium text-slate-500">
                  When off, no OD feed entry or alert email is sent for late sign-ins.
                </span>
              </span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Alert window start</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Alert window end</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            <p className="flex items-start gap-2 rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2 text-xs font-medium text-sky-900">
              <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              Times use Asia/Colombo. Overnight windows are supported — e.g. 17:00 to 08:00 covers
              evenings through early morning.
            </p>

            <div>
              <label className={labelCls}>Alert email recipients</label>
              <textarea
                value={notifyEmails}
                onChange={(event) => setNotifyEmails(event.target.value)}
                rows={4}
                placeholder={'od@company.com\nsecurity@company.com'}
                className={`${inputCls} min-h-[6rem] resize-y font-mono text-xs normal-case tracking-normal`}
              />
              <p className="mt-2 text-xs font-medium text-slate-500">
                One email per line or comma-separated. Leave blank to use active OD portal work
                emails.
              </p>
            </div>

            {error ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--cvs-accent)] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-sm hover:opacity-95 disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? 'Saving…' : 'Save alert settings'}
              </button>
              {saved ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Saved
                </span>
              ) : null}
            </div>
          </>
        )}
      </div>
    </ExecutiveGlassCard>
  );
}

function PortalSecurityNotificationsPanel() {
  const [notifications, setNotifications] = useState<
    Array<{
      id: string;
      eventType: string;
      message: string;
      createdAt: string;
      readAt: string | null;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { listPortalSecurityNotificationsAction } = await import(
        './portal-security-feed-actions'
      );
      const result = await listPortalSecurityNotificationsAction();
      if ('error' in result) {
        setError(result.error);
        setNotifications([]);
        return;
      }
      setNotifications(result.notifications);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications.');
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = async (id: string) => {
    setBusyId(id);
    try {
      const { markPortalSecurityNotificationReadAction } = await import(
        './portal-security-feed-actions'
      );
      await markPortalSecurityNotificationReadAction(id);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <ExecutiveGlassCard className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 px-6 py-4">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-amber-600" />
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">
            Security Notifications
          </h3>
          {unreadCount > 0 ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-800">
              {unreadCount} unread
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>

      <div className="divide-y divide-slate-200/60">
        {loading ? (
          <ExecutivePageLoading
            message="Loading notifications…"
            compact
            className="px-4 py-8 sm:px-6"
          />
        ) : error ? (
          <p className="px-4 py-6 text-center text-sm font-semibold text-rose-700 sm:px-6">{error}</p>
        ) : notifications.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500 sm:px-6">
            No security notifications yet. OTP provisions and access events appear here.
          </p>
        ) : (
          notifications.map((item) => (
            <div
              key={item.id}
              className={`flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-start sm:justify-between ${
                item.readAt ? 'bg-white/30' : 'bg-amber-50/40'
              }`}
            >
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  {formatPortalEventLabel(item.eventType)}
                  <span className="mx-2 text-slate-300">·</span>
                  {new Date(item.createdAt).toLocaleString('en-LK', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </p>
                <p className="mt-1 text-sm font-medium text-slate-800">{item.message}</p>
              </div>
              {!item.readAt ? (
                <button
                  type="button"
                  onClick={() => void markRead(item.id)}
                  disabled={busyId === item.id}
                  className="flex-shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {busyId === item.id ? 'Marking…' : 'Mark read'}
                </button>
              ) : (
                <span className="flex-shrink-0 text-xs font-semibold text-slate-400">Read</span>
              )}
            </div>
          ))
        )}
      </div>
    </ExecutiveGlassCard>
  );
}

const LOGIN_HISTORY_PAGE_SIZE = 10;

type PortalLoginHistoryEvent = {
  id: string;
  employeeName: string | null;
  employeeRank: string | null;
  eventType: string;
  success: boolean;
  ipAddress: string | null;
  detail: string | null;
  createdAt: string;
};

function formatLoginHistoryTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-LK', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function LoginHistoryResultBadge({ success }: { success: boolean }) {
  return success ? (
    <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-800">
      OK
    </span>
  ) : (
    <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-black uppercase text-rose-800">
      Failed
    </span>
  );
}

function LoginHistoryPaginationBar({
  page,
  total,
  pageSize,
  loading,
  onPageChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  loading: boolean;
  onPageChange: (nextPage: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const rangeStart = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = total === 0 ? 0 : Math.min(safePage * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 bg-slate-50/50 px-4 py-3 sm:px-6">
      <p className="text-[11px] font-semibold text-slate-500">
        {total === 0
          ? 'No events'
          : `Showing ${rangeStart}–${rangeEnd} of ${total.toLocaleString()} events`}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(safePage - 1)}
          disabled={loading || safePage <= 1}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Prev
        </button>
        <span className="min-w-[5.5rem] text-center text-[11px] font-bold text-slate-600">
          Page {safePage} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(safePage + 1)}
          disabled={loading || safePage >= totalPages}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function PortalLoginHistoryPanel() {
  const [events, setEvents] = useState<PortalLoginHistoryEvent[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (targetPage = page) => {
    setLoading(true);
    setError(null);
    try {
      const { listCompanyPortalLoginEventsAction } = await import(
        './portal-security-feed-actions'
      );
      const result = await listCompanyPortalLoginEventsAction(
        targetPage,
        LOGIN_HISTORY_PAGE_SIZE,
      );
      if ('error' in result) {
        setError(result.error);
        setEvents([]);
        setTotal(0);
        return;
      }
      setEvents(result.events);
      setTotal(result.total);
      setPage(result.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load login history.');
      setEvents([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  const handleRefresh = () => {
    void load(page);
  };

  const handlePageChange = (nextPage: number) => {
    if (nextPage < 1) return;
    setPage(nextPage);
  };

  return (
    <ExecutiveGlassCard className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 px-6 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ScrollText className="h-4 w-4 text-[color:var(--cvs-accent)]" />
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">
              Portal Login History
            </h3>
            {total > 0 ? (
              <span className="rounded-full border border-slate-200 bg-white/80 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-500">
                {total.toLocaleString()} total
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs font-medium text-slate-500">
            Head Office sign-ins, OTP issues, and MFA events — newest first, {LOGIN_HISTORY_PAGE_SIZE} per page.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="hidden overflow-x-auto md:block">
        {loading ? (
          <ExecutivePageLoading
            message="Loading login events…"
            className="min-h-[8rem] py-6"
          />
        ) : error ? (
          <p className="px-6 py-6 text-center text-sm font-semibold text-rose-700">{error}</p>
        ) : events.length === 0 ? (
          <p className="px-6 py-6 text-center text-sm text-slate-500">No login events recorded yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200/80 bg-slate-50/60 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              <tr>
                <th className="w-36 px-4 py-2.5">When</th>
                <th className="px-4 py-2.5">Staff</th>
                <th className="px-4 py-2.5">Event</th>
                <th className="w-32 px-4 py-2.5">IP</th>
                <th className="w-24 px-4 py-2.5 text-center">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/50">
              {events.map((event) => (
                <tr key={event.id} className="hover:bg-white/40">
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-600">
                    {formatLoginHistoryTimestamp(event.createdAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="text-sm font-semibold text-slate-900">
                      {event.employeeName ?? 'Unknown'}
                    </p>
                    {event.employeeRank ? (
                      <p className="text-[11px] text-slate-500">{event.employeeRank}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="text-sm font-medium text-slate-700">
                      {formatPortalEventLabel(event.eventType)}
                    </p>
                    {event.detail ? (
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">{event.detail}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-slate-600">
                    {event.ipAddress ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <LoginHistoryResultBadge success={event.success} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="space-y-2 p-4 md:hidden">
        {loading ? (
          <ExecutivePageLoading
            message="Loading login events…"
            className="min-h-[8rem] py-6"
          />
        ) : error ? (
          <p className="text-center text-sm font-semibold text-rose-700">{error}</p>
        ) : events.length === 0 ? (
          <p className="text-center text-sm text-slate-500">No login events recorded yet.</p>
        ) : (
          events.map((event) => (
            <div key={event.id} className="rounded-xl border border-slate-200/80 bg-white/60 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-semibold text-slate-500">
                  {formatLoginHistoryTimestamp(event.createdAt)}
                </p>
                <LoginHistoryResultBadge success={event.success} />
              </div>
              <p className="mt-1 text-sm font-bold text-slate-900">
                {event.employeeName ?? 'Unknown'}
                {event.employeeRank ? ` · ${event.employeeRank}` : ''}
              </p>
              <p className="mt-0.5 text-sm text-slate-700">{formatPortalEventLabel(event.eventType)}</p>
              {event.detail ? (
                <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{event.detail}</p>
              ) : null}
              <p className="mt-2 font-mono text-[11px] text-slate-500">{event.ipAddress ?? '—'}</p>
            </div>
          ))
        )}
      </div>

      {!error ? (
        <LoginHistoryPaginationBar
          page={page}
          total={total}
          pageSize={LOGIN_HISTORY_PAGE_SIZE}
          loading={loading}
          onPageChange={handlePageChange}
        />
      ) : null}
    </ExecutiveGlassCard>
  );
}

export {
  SecuritySessionsPanel,
  VaultPinConfigPanel,
  AfterHoursLoginAlertsPanel,
  PortalSecurityNotificationsPanel,
  PortalLoginHistoryPanel,
};
