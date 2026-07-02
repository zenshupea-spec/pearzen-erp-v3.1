'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Lock, LogOut, ShieldCheck } from 'lucide-react';

import { signOutHeadOfficePortalAction } from '../../app/actions/portal-session-actions';
import {
  clearExecutiveVaultUnlockAction,
  getVaultSessionPolicy,
  verifyVaultUnlockPin,
} from '../../app/actions/vault-session-actions';
import { createSupabaseBrowserClient } from '../../../../packages/supabase/client';

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function PortalSessionChrome() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [signedIn, setSignedIn] = useState(false);
  const [locked, setLocked] = useState(false);
  const [policy, setPolicy] = useState({
    autoLockEnabled: true,
    idleTimeoutMinutes: 30,
  });
  const [remainingMs, setRemainingMs] = useState(30 * 60 * 1000);
  const [pin, setPin] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlocking, setUnlocking] = useState(false);

  const deadlineRef = useRef(Date.now() + 30 * 60 * 1000);
  const signingOutRef = useRef(false);

  const bumpIdleDeadline = useCallback(() => {
    const ms = policy.idleTimeoutMinutes * 60 * 1000;
    deadlineRef.current = Date.now() + ms;
    setRemainingMs(ms);
  }, [policy.idleTimeoutMinutes]);

  const resetIdleDeadline = useCallback(() => {
    if (!policy.autoLockEnabled || locked) return;
    bumpIdleDeadline();
  }, [bumpIdleDeadline, locked, policy.autoLockEnabled]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      setSignedIn(Boolean(user));
      if (!user) return;

      try {
        const vaultPolicy = await getVaultSessionPolicy();
        if (cancelled) return;
        setPolicy(vaultPolicy);
        const ms = vaultPolicy.idleTimeoutMinutes * 60 * 1000;
        deadlineRef.current = Date.now() + ms;
        setRemainingMs(ms);
      } catch {
        /* defaults */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!signedIn || !policy.autoLockEnabled || locked) return;

    const onActivity = () => resetIdleDeadline();
    const events = ["mousedown", "keydown", "touchstart", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    const tick = window.setInterval(() => {
      const left = deadlineRef.current - Date.now();
      if (left <= 0) {
        void clearExecutiveVaultUnlockAction();
        setLocked(true);
        setRemainingMs(0);
        return;
      }
      setRemainingMs(left);
    }, 1000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      window.clearInterval(tick);
    };
  }, [locked, policy.autoLockEnabled, resetIdleDeadline, signedIn]);

  const handleSignOut = async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    await signOutHeadOfficePortalAction();
    router.replace("/");
    router.refresh();
  };

  const handleLockNow = () => {
    void clearExecutiveVaultUnlockAction();
    setLocked(true);
    setRemainingMs(0);
  };

  const handleUnlock = async (event: FormEvent) => {
    event.preventDefault();
    setUnlockError('');
    if (pin.length !== 4) {
      setUnlockError('Enter your 4-digit vault PIN.');
      return;
    }

    setUnlocking(true);
    try {
      const result = await verifyVaultUnlockPin(pin);
      if (!result.ok) {
        setUnlockError(result.error ?? 'Incorrect vault PIN.');
        setPin('');
        return;
      }
      bumpIdleDeadline();
      setLocked(false);
      setPin('');
    } finally {
      setUnlocking(false);
    }
  };

  if (!signedIn) return null;

  return (
    <>
      <div className="fixed top-3 right-3 z-[200] flex items-center gap-2">
        {policy.autoLockEnabled && !locked && (
          <button
            type="button"
            onClick={handleLockNow}
            title={`Vault locks after ${policy.idleTimeoutMinutes} min idle`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200/90 bg-white/95 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-amber-900 shadow-sm backdrop-blur-md hover:bg-amber-50"
          >
            <Lock className="h-3.5 w-3.5" />
            <span>{formatCountdown(remainingMs)}</span>
          </button>
        )}
        <button
          type="button"
          onClick={handleSignOut}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 shadow-sm backdrop-blur-md hover:bg-slate-50"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>

      {locked && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/85 backdrop-blur-md">
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-8 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-500/40 bg-indigo-500/10">
              <Lock className="h-7 w-7 text-indigo-300" />
            </div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-indigo-400">
              Vault locked
            </p>
            <h2 className="mt-2 text-lg font-bold text-white">Session paused</h2>
            <p className="mt-2 text-sm text-slate-400">
              {policy.autoLockEnabled
                ? `Idle timeout reached (${policy.idleTimeoutMinutes} min MD policy).`
                : "You locked this session manually."}
            </p>
            <form onSubmit={handleUnlock} className="mt-6 space-y-3">
              {unlockError ? (
                <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-200">
                  {unlockError}
                </p>
              ) : null}
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={pin}
                onChange={(event) => {
                  setUnlockError('');
                  setPin(event.target.value.replace(/\D/g, '').slice(0, 4));
                }}
                placeholder="••••"
                className="w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-center text-lg font-black tracking-[0.45em] text-white focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
              <button
                type="submit"
                disabled={unlocking || pin.length !== 4}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                <ShieldCheck className="h-4 w-4" />
                {unlocking ? 'Verifying…' : 'Unlock and continue'}
              </button>
            </form>
            <button
              type="button"
              onClick={handleSignOut}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-600 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-300 hover:bg-slate-800"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out completely
            </button>
            {pathname !== "/" && (
              <p className="mt-4 text-[10px] text-slate-500">{pathname}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
