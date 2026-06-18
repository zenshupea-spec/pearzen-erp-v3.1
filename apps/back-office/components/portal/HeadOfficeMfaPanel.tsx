'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  KeyRound,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  Users,
} from 'lucide-react';

import { ExecutiveGlassCard } from '../executive/ExecutiveVaultShell';
import BackupCodesPanel from './BackupCodesPanel';
import { isHeadOfficeBackupCodeInput } from '../../lib/head-office-totp-backup-client';
import {
  confirmHeadOfficeMfaEnrollmentAction,
  loadHeadOfficeMfaEnrollmentAction,
  removeHeadOfficeMfaAction,
  replaceHeadOfficeMfaAction,
  type HeadOfficeMfaEnrollmentState,
} from '../../lib/head-office-mfa-actions';

const inputCls =
  'w-full rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all';
const labelCls = 'mb-1 block text-sm font-bold uppercase tracking-wide text-slate-700';

function formatTotpSetupKey(secret: string): string {
  const cleaned = secret.replace(/\s/g, '').toUpperCase();
  return cleaned.match(/.{1,4}/g)?.join(' ') ?? cleaned;
}

function accentForRole(role: string) {
  if (role === 'OD') {
    return {
      border: 'border-violet-200/80',
      bg: 'bg-violet-50/80',
      icon: 'text-violet-700',
      btn: 'bg-violet-600 shadow-violet-600/25 hover:bg-violet-500',
      label: 'text-violet-700',
      badge: 'border-violet-200/80 bg-violet-50/80 text-violet-800',
      ring: 'focus:ring-violet-500/40',
    };
  }
  return {
    border: 'border-indigo-200/80',
    bg: 'bg-indigo-50/80',
    icon: 'text-indigo-700',
    btn: 'bg-indigo-600 shadow-indigo-600/25 hover:bg-indigo-500',
    label: 'text-indigo-700',
    badge: 'border-emerald-200/80 bg-emerald-50/80 text-emerald-800',
    ring: 'focus:ring-indigo-500/40',
  };
}

function MfaSetupForm({
  enrollment,
  onEnabled,
}: {
  enrollment: HeadOfficeMfaEnrollmentState;
  onEnabled: (backupCodes: string[]) => void;
}) {
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const accent = accentForRole(enrollment.role);
  const setupKey = enrollment.secret ? formatTotpSetupKey(enrollment.secret) : '';

  const handleEnable = () => {
    setOtpError(false);
    setSubmitError(null);
    if (otpCode.length !== 6) {
      setOtpError(true);
      return;
    }
    startTransition(async () => {
      const result = await confirmHeadOfficeMfaEnrollmentAction(otpCode);
      if ('error' in result && result.error) {
        setSubmitError(result.error);
        return;
      }
      setOtpCode('');
      if ('backupCodes' in result && result.backupCodes?.length) {
        setBackupCodes(result.backupCodes);
        return;
      }
      onEnabled([]);
    });
  };

  if (backupCodes) {
    return (
      <BackupCodesPanel
        codes={backupCodes}
        onContinue={() => onEnabled(backupCodes)}
        continueLabel="Done — MFA is active"
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[auto_1fr]">
      <div className="flex flex-col items-center gap-2">
        <div className="flex h-36 w-36 flex-col items-center justify-center rounded-2xl border-4 border-slate-800 bg-slate-800 shadow-lg shadow-slate-900/30 select-none px-3 text-center">
          <Smartphone className="mb-2 h-8 w-8 text-slate-300" />
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 leading-tight">
            Add manual key
            <br />
            in authenticator app
          </p>
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Step 1 — Add Key</p>
      </div>

      <div className="flex flex-col justify-center gap-4">
        <div>
          <label className={`${labelCls} flex items-center gap-1.5`}>
            <KeyRound className="h-3 w-3 text-slate-500" />
            Manual Setup Key
          </label>
          <div className="relative">
            <input
              type="text"
              readOnly
              value={setupKey || 'Generating setup key…'}
              className="w-full rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2 font-mono text-sm font-bold tracking-widest text-slate-700 shadow-inner focus:outline-none cursor-default select-all"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Read Only
            </span>
          </div>
        </div>

        <div>
          <label className={`${labelCls} flex items-center gap-1.5`}>
            <ShieldCheck className="h-3 w-3 text-indigo-600" />
            Verify 6-Digit Code
          </label>
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otpCode}
                onChange={(e) => {
                  setOtpError(false);
                  setSubmitError(null);
                  setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                }}
                placeholder="6-digit code from authenticator app"
                disabled={!setupKey || isPending}
                className={`${inputCls} font-mono tracking-[0.35em] ${otpError ? 'border-rose-300/80 ring-2 ring-rose-500/20' : ''}`}
              />
              {otpError && (
                <p className="mt-1 flex items-center gap-1 text-sm font-bold text-rose-700">
                  <ShieldAlert className="h-3 w-3" /> A 6-digit code is required
                </p>
              )}
              {submitError && (
                <p className="mt-1 flex items-center gap-1 text-sm font-bold text-rose-700">
                  <ShieldAlert className="h-3 w-3" /> {submitError}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={handleEnable}
              disabled={!setupKey || isPending}
              className={`flex flex-shrink-0 items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-black uppercase tracking-widest text-white shadow-lg transition-all ${accent.btn}`}
            >
              {isPending ? 'Enabling…' : (
                <>
                  <Lock className="h-4 w-4" /> Enable
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MfaActivePanel({
  enrollment,
  onRemoved,
  onReplaced,
}: {
  enrollment: HeadOfficeMfaEnrollmentState;
  onRemoved: () => void;
  onReplaced: (secret: string | null) => void;
}) {
  const [removeCode, setRemoveCode] = useState('');
  const [replaceCode, setReplaceCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'idle' | 'remove' | 'replace'>('idle');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [isPending, startTransition] = useTransition();

  const activeCode = mode === 'replace' ? replaceCode : removeCode;
  const setActiveCode = mode === 'replace' ? setReplaceCode : setRemoveCode;

  const isCodeValid = useBackupCode
    ? isHeadOfficeBackupCodeInput(activeCode)
    : activeCode.length === 6;

  const runRemove = () => {
    setError(null);
    if (!isCodeValid) {
      setError(
        useBackupCode
          ? 'Enter an 8-character backup code.'
          : 'Enter your current 6-digit authenticator code.',
      );
      return;
    }
    startTransition(async () => {
      const result = await removeHeadOfficeMfaAction(removeCode);
      if ('error' in result && result.error) {
        setError(result.error);
        return;
      }
      setRemoveCode('');
      setMode('idle');
      onRemoved();
    });
  };

  const runReplace = () => {
    setError(null);
    if (!isCodeValid) {
      setError(
        useBackupCode
          ? 'Enter an 8-character backup code.'
          : 'Enter your current 6-digit authenticator code.',
      );
      return;
    }
    startTransition(async () => {
      const result = await replaceHeadOfficeMfaAction(replaceCode);
      if ('error' in result && result.error) {
        setError(result.error);
        return;
      }
      if (!('success' in result) || !result.success) return;
      setReplaceCode('');
      setMode('idle');
      onReplaced('secret' in result ? result.secret ?? null : null);
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-900">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <div>
          <p className="font-bold">Authenticator bound to {enrollment.email}</p>
          <p className="mt-1 text-emerald-800">
            Vault login for your {enrollment.role} account requires a time-based 6-digit code from your authenticator app.
          </p>
        </div>
      </div>

      {mode === 'idle' ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setUseBackupCode(false);
              setMode('replace');
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-indigo-800 hover:bg-indigo-100 transition-all"
          >
            <KeyRound className="h-3.5 w-3.5" />
            Replace authenticator
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setUseBackupCode(false);
              setMode('remove');
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-rose-800 hover:bg-rose-100 transition-all"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove 2FA
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 space-y-3">
          <p className="text-sm font-bold text-slate-800">
            {mode === 'replace'
              ? 'Enter your current authenticator or backup code to remove the old key and generate a new setup key.'
              : 'Enter your current authenticator or backup code to remove 2FA from this account.'}
          </p>
          <input
            type="text"
            inputMode={useBackupCode ? 'text' : 'numeric'}
            maxLength={useBackupCode ? 9 : 6}
            value={activeCode}
            onChange={(e) => {
              setError(null);
              const raw = e.target.value;
              setActiveCode(
                useBackupCode
                  ? raw.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 9)
                  : raw.replace(/\D/g, '').slice(0, 6),
              );
            }}
            placeholder={useBackupCode ? 'XXXX-XXXX backup code' : 'Current 6-digit code'}
            className={`${inputCls} max-w-xs font-mono tracking-[0.35em]`}
          />
          <button
            type="button"
            onClick={() => {
              setUseBackupCode((prev) => !prev);
              setActiveCode('');
              setError(null);
            }}
            className="text-xs font-bold uppercase tracking-wider text-indigo-700 hover:text-indigo-900"
          >
            {useBackupCode ? 'Use authenticator code instead' : "Can't reach authenticator? Use backup code"}
          </button>
          {error && (
            <p className="flex items-center gap-1 text-sm font-bold text-rose-700">
              <ShieldAlert className="h-3 w-3" /> {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={mode === 'replace' ? runReplace : runRemove}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider text-white shadow-md disabled:opacity-50 ${
                mode === 'replace' ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-rose-600 hover:bg-rose-500'
              }`}
            >
              {isPending ? 'Working…' : mode === 'replace' ? 'Replace key' : 'Confirm remove'}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setMode('idle');
                setError(null);
                setUseBackupCode(false);
                setRemoveCode('');
                setReplaceCode('');
              }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MfaSlot({
  enrollment,
  onReload,
}: {
  enrollment: HeadOfficeMfaEnrollmentState;
  onReload: () => void;
}) {
  const [state, setState] = useState(enrollment);
  const accent = accentForRole(state.role);

  useEffect(() => {
    setState(enrollment);
  }, [enrollment]);

  return (
    <div className={`rounded-2xl border ${accent.border} bg-white/60 shadow-sm overflow-hidden`}>
      <div className={`border-b ${accent.border} ${accent.bg} px-5 py-3 flex items-center justify-between gap-3`}>
        <div className="flex items-center gap-2.5">
          <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border ${accent.border} ${accent.bg}`}>
            <Smartphone className={`h-4.5 w-4.5 ${accent.icon}`} />
          </div>
          <div>
            <p className={`text-sm font-black uppercase tracking-widest ${accent.label}`}>{state.role}</p>
            <p className="text-xs font-semibold text-slate-600">{state.label}</p>
          </div>
        </div>
        {state.twoFactorEnabled ? (
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-black uppercase tracking-wider ${accent.badge}`}>
            <CircleDot className="h-2.5 w-2.5 text-emerald-500 animate-pulse" />
            MFA Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-50/80 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-slate-500">
            Not Enrolled
          </span>
        )}
      </div>

      <div className="p-5">
        {state.twoFactorEnabled ? (
          <MfaActivePanel
            enrollment={state}
            onRemoved={() => {
              setState({ ...state, twoFactorEnabled: false, secret: null, uri: null });
              onReload();
            }}
            onReplaced={(secret) => {
              setState({ ...state, twoFactorEnabled: false, secret, uri: null });
            }}
          />
        ) : (
          <MfaSetupForm
            enrollment={state}
            onEnabled={() => {
              setState({ ...state, twoFactorEnabled: true, secret: null, uri: null });
              onReload();
            }}
          />
        )}
      </div>
    </div>
  );
}

type HeadOfficeMfaPanelProps = {
  showTraceability?: boolean;
  Traceability?: React.ComponentType;
};

export default function HeadOfficeMfaPanel({
  showTraceability = false,
  Traceability,
}: HeadOfficeMfaPanelProps) {
  const [enrollment, setEnrollment] = useState<HeadOfficeMfaEnrollmentState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reloadEnrollment = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const result = await loadHeadOfficeMfaEnrollmentAction();
    if ('error' in result) {
      setEnrollment(null);
      setLoadError(result.error);
    } else {
      setEnrollment(result);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reloadEnrollment();
  }, [reloadEnrollment]);

  return (
    <ExecutiveGlassCard className="overflow-hidden">
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-indigo-200/80 bg-indigo-50/80">
            <Smartphone className="h-5 w-5 text-indigo-700" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">Two-Factor Authentication (2FA)</h3>
            <p className="text-sm font-medium text-slate-600">
              Bind Google Authenticator (or similar) to your Head Office portal account.
            </p>
            {showTraceability && Traceability ? <Traceability /> : null}
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-indigo-200/80 bg-indigo-50/80 px-3 py-1 text-xs font-black uppercase tracking-wider text-indigo-800">
            <Users className="h-3 w-3" />
            Your Account
          </span>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {loading ? (
          <p className="text-sm font-semibold text-slate-500">Loading MFA status…</p>
        ) : loadError ? (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200/80 bg-rose-50/60 px-3 py-2.5 text-sm text-rose-900">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-rose-600" />
            <span>{loadError}</span>
          </div>
        ) : enrollment ? (
          <MfaSlot enrollment={enrollment} onReload={reloadEnrollment} />
        ) : null}

        <div className="flex items-start gap-2 rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-2.5 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
          <span>
            Removing or replacing 2FA requires your current authenticator code or a one-time backup
            code. Five backup codes are issued when you enable 2FA — store them somewhere safe.
          </span>
        </div>
      </div>
    </ExecutiveGlassCard>
  );
}
