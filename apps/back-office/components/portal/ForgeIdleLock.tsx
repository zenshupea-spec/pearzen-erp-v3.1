'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { KeyRound, Lock, LogOut } from 'lucide-react';

import {
  getForgeIdleLockMinutesAction,
  verifyForgeUnlockCodeAction,
  forgeSignOutAction,
} from '../../app/actions/forge-session-actions';
import { createSupabaseBrowserClient } from '../../../../packages/supabase/client';

const IDLE_MS_DEFAULT = 15 * 60 * 1000;

export default function ForgeIdleLock() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [signedIn, setSignedIn] = useState(false);
  const [locked, setLocked] = useState(false);
  const [idleMs, setIdleMs] = useState(IDLE_MS_DEFAULT);
  const [unlockCode, setUnlockCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isPending, startTransition] = useTransition();

  const deadlineRef = useRef(Date.now() + IDLE_MS_DEFAULT);
  const signingOutRef = useRef(false);

  const resetIdleDeadline = useCallback(() => {
    if (locked) return;
    deadlineRef.current = Date.now() + idleMs;
  }, [idleMs, locked]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      setSignedIn(Boolean(user));
      if (!user) return;
      const policy = await getForgeIdleLockMinutesAction();
      if (cancelled) return;
      const ms = policy.minutes * 60 * 1000;
      setIdleMs(ms);
      deadlineRef.current = Date.now() + ms;
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!signedIn || locked) return;

    const onActivity = () => resetIdleDeadline();
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
    events.forEach((event) => window.addEventListener(event, onActivity, { passive: true }));

    const timer = window.setInterval(() => {
      if (Date.now() >= deadlineRef.current) {
        setLocked(true);
      }
    }, 1000);

    return () => {
      events.forEach((event) => window.removeEventListener(event, onActivity));
      window.clearInterval(timer);
    };
  }, [signedIn, locked, resetIdleDeadline]);

  const handleSignOut = () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    startTransition(async () => {
      await forgeSignOutAction();
      router.refresh();
    });
  };

  const handleUnlock = () => {
    setErrorMsg('');
    startTransition(async () => {
      const result = await verifyForgeUnlockCodeAction(unlockCode);
      if (result?.error) {
        setErrorMsg(result.error);
        return;
      }
      setUnlockCode('');
      setLocked(false);
      resetIdleDeadline();
    });
  };

  if (!signedIn) return null;

  return (
    <>
      {locked ? (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/95 px-6 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl border border-indigo-500/30 bg-slate-900 p-8 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10">
                <Lock className="h-6 w-6 text-indigo-300" />
              </div>
              <div>
                <h2 className="text-lg font-black text-white">Forge locked</h2>
                <p className="text-sm text-slate-400">Idle timeout — enter your 6-digit unlock code.</p>
              </div>
            </div>
            {errorMsg ? (
              <p className="mb-3 text-xs font-bold text-rose-300">{errorMsg}</p>
            ) : null}
            <input
              inputMode="numeric"
              value={unlockCode}
              onChange={(event) => setUnlockCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              className="mb-4 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-center font-mono text-xl tracking-[0.4em] text-white"
              placeholder="••••••"
            />
            <button
              type="button"
              onClick={handleUnlock}
              disabled={isPending || unlockCode.length !== 6}
              className="mb-3 w-full rounded-xl bg-indigo-600 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50"
            >
              {isPending ? 'Unlocking…' : 'Unlock'}
            </button>
            <div className="flex items-center justify-between text-xs">
              <Link
                href="/login/forge/reset-unlock-code"
                className="inline-flex items-center gap-1 text-indigo-300 hover:underline"
              >
                <KeyRound className="h-3 w-3" />
                Forgot unlock code
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-1 text-slate-400 hover:text-white"
              >
                <LogOut className="h-3 w-3" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
