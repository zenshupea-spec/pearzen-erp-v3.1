'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { KeyRound, Lock, LogOut, ShieldCheck } from 'lucide-react';

import {
  getHeadOfficePortalSessionContextAction,
  getPortalIdleLockMinutesAction,
  invalidatePortalIdleLockAction,
  signOutHeadOfficePortalAction,
  verifyHeadOfficeUnlockCodeAction,
} from '../../app/actions/portal-session-actions';
import { createSupabaseBrowserClient } from '../../../../packages/supabase/client';
import { bindPortalIdleActivity } from '../../lib/portal-idle-activity';
import { PORTAL_IDLE_LOCK_MINUTES } from '../../lib/portal-idle-lock';
import { shouldShowHeadOfficePasswordExpiryBanner } from '../../lib/portal-password-expiry-banner';
import type { HeadOfficePasswordExpiryContext } from '../../lib/head-office-portal-password-expiry';
import PortalPasswordExpiryBanner from './PortalPasswordExpiryBanner';
import StaffProfileMenu from './StaffProfileMenu';

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

type PortalSessionContextValue = {
  idleLockApplies: boolean;
  locked: boolean;
  idleMinutes: number;
  remainingMs: number;
  engageIdleLock: () => void;
  handleSignOut: () => Promise<void>;
  registerInlineSessionBar: () => () => void;
};

const PortalSessionContext = createContext<PortalSessionContextValue | null>(null);

export function usePortalSession(): PortalSessionContextValue | null {
  return useContext(PortalSessionContext);
}

export function PortalSessionControls({
  variant = 'fixed',
  className = '',
}: {
  variant?: 'fixed' | 'inline';
  className?: string;
}) {
  const session = usePortalSession();

  useEffect(() => {
    if (variant !== 'inline' || !session) return undefined;
    return session.registerInlineSessionBar();
  }, [session, variant]);

  if (!session) return null;

  const controls = (
    <>
      {session.idleLockApplies && !session.locked ? (
        <button
          type="button"
          onClick={session.engageIdleLock}
          title={`Portal auto-locks after ${session.idleMinutes} minutes with no activity`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200/90 bg-white/95 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-amber-900 shadow-sm backdrop-blur-md hover:bg-amber-50"
        >
          <Lock className="h-3.5 w-3.5" />
          <span>{formatCountdown(session.remainingMs)}</span>
        </button>
      ) : null}
      <StaffProfileMenu
        showLockScreen={session.idleLockApplies}
        onLockScreen={session.idleLockApplies ? session.engageIdleLock : undefined}
        onSignOut={session.handleSignOut}
      />
    </>
  );

  if (variant === 'fixed') {
    return (
      <div
        className={`fixed right-3 z-[200] flex items-center gap-2 ${className || 'top-3'}`.trim()}
      >
        {controls}
      </div>
    );
  }

  return (
    <div className={`flex shrink-0 items-center gap-2 ${className}`.trim()}>{controls}</div>
  );
}

export default function PortalSessionProvider({ children }: { children?: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [signedIn, setSignedIn] = useState(false);
  const [idleLockApplies, setIdleLockApplies] = useState(false);
  const [inlineBarCount, setInlineBarCount] = useState(0);
  const [passwordExpiry, setPasswordExpiry] = useState<HeadOfficePasswordExpiryContext | null>(
    null,
  );
  const [locked, setLocked] = useState(false);
  const [idleMinutes, setIdleMinutes] = useState(PORTAL_IDLE_LOCK_MINUTES);
  const [idleMs, setIdleMs] = useState(PORTAL_IDLE_LOCK_MINUTES * 60 * 1000);
  const [remainingMs, setRemainingMs] = useState(PORTAL_IDLE_LOCK_MINUTES * 60 * 1000);
  const [unlockCode, setUnlockCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isPending, startTransition] = useTransition();
  const [signInPath, setSignInPath] = useState('/login/hq');

  const deadlineRef = useRef(Date.now() + PORTAL_IDLE_LOCK_MINUTES * 60 * 1000);
  const signingOutRef = useRef(false);

  const bumpIdleDeadline = useCallback(() => {
    deadlineRef.current = Date.now() + idleMs;
    setRemainingMs(idleMs);
  }, [idleMs]);

  const resetIdleDeadline = useCallback(() => {
    if (locked) return;
    bumpIdleDeadline();
  }, [bumpIdleDeadline, locked]);

  const engageIdleLock = useCallback(() => {
    void invalidatePortalIdleLockAction();
    setLocked(true);
    setRemainingMs(0);
  }, []);

  const registerInlineSessionBar = useCallback(() => {
    setInlineBarCount((count) => count + 1);
    return () => setInlineBarCount((count) => Math.max(0, count - 1));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      setSignedIn(Boolean(user));
      if (!user) return;

      const policy = await getPortalIdleLockMinutesAction();
      if (cancelled) return;
      const minutes = policy.minutes;
      setIdleMinutes(minutes);
      const ms = minutes * 60 * 1000;
      setIdleMs(ms);
      deadlineRef.current = Date.now() + ms;
      setRemainingMs(ms);

      const context = await getHeadOfficePortalSessionContextAction();
      if (cancelled) return;
      setSignInPath(context.signInPath);
      setIdleLockApplies(!context.isExecutive);
      setPasswordExpiry(context.passwordExpiry);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!signedIn || !idleLockApplies || locked) return;

    const onActivity = () => resetIdleDeadline();
    const unbind = bindPortalIdleActivity(onActivity);

    const tick = window.setInterval(() => {
      const left = deadlineRef.current - Date.now();
      if (left <= 0) {
        engageIdleLock();
        return;
      }
      setRemainingMs(left);
    }, 1000);

    return () => {
      unbind();
      window.clearInterval(tick);
    };
  }, [engageIdleLock, idleLockApplies, locked, resetIdleDeadline, signedIn]);

  const handleSignOut = useCallback(async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    await signOutHeadOfficePortalAction();
    router.replace(signInPath);
    router.refresh();
  }, [router, signInPath]);

  const handleUnlock = () => {
    setErrorMsg('');
    if (unlockCode.length !== 6) {
      setErrorMsg('Enter your 6-digit unlock code.');
      return;
    }
    startTransition(async () => {
      const result = await verifyHeadOfficeUnlockCodeAction(unlockCode);
      if (result?.error) {
        setErrorMsg(result.error);
        return;
      }
      setUnlockCode('');
      bumpIdleDeadline();
      setLocked(false);
    });
  };

  const contextValue = useMemo<PortalSessionContextValue>(
    () => ({
      idleLockApplies,
      locked,
      idleMinutes,
      remainingMs,
      engageIdleLock,
      handleSignOut,
      registerInlineSessionBar,
    }),
    [
      engageIdleLock,
      handleSignOut,
      idleLockApplies,
      idleMinutes,
      locked,
      registerInlineSessionBar,
      remainingMs,
    ],
  );

  const showFixedBar = signedIn && inlineBarCount === 0;
  const showExpiryBanner =
    signedIn && shouldShowHeadOfficePasswordExpiryBanner(passwordExpiry, pathname);
  const changePasswordHref =
    pathname && pathname !== '/account/change-password'
      ? `/account/change-password?returnTo=${encodeURIComponent(pathname)}`
      : '/account/change-password';

  return (
    <PortalSessionContext.Provider value={contextValue}>
      {showExpiryBanner && passwordExpiry ? (
        <PortalPasswordExpiryBanner
          expiry={passwordExpiry}
          changePasswordHref={changePasswordHref}
        />
      ) : null}

      {showFixedBar ? (
        <PortalSessionControls
          variant="fixed"
          className={showExpiryBanner ? 'top-14 sm:top-12' : 'top-3'}
        />
      ) : null}

      {signedIn && idleLockApplies && locked ? (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-2xl">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-500/40 bg-indigo-500/10">
              <Lock className="h-7 w-7 text-indigo-300" />
            </div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-indigo-400">
              Portal locked
            </p>
            <h2 className="mt-2 text-lg font-bold text-white">{idleMinutes}-minute idle timeout</h2>
            <p className="mt-2 text-sm text-slate-400">
              No clicks, scroll, or typing for {idleMinutes} minutes. Enter your 6-digit unlock code to
              continue.
            </p>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={unlockCode}
              onChange={(e) => setUnlockCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="mt-4 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-center font-mono text-lg tracking-[0.4em] text-white"
              placeholder="••••••"
            />
            {errorMsg ? (
              <p className="mt-2 text-center text-xs font-bold text-rose-400">{errorMsg}</p>
            ) : null}
            <button
              type="button"
              disabled={isPending}
              onClick={handleUnlock}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4" />
              Unlock
            </button>
            <Link
              href="/login/reset-unlock-code"
              className="mt-3 flex items-center justify-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white"
            >
              <KeyRound className="h-3.5 w-3.5" />
              Forgot unlock code? Use your password
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-600 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-300 hover:bg-slate-800"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out completely
            </button>
          </div>
        </div>
      ) : null}

      <div className={showExpiryBanner ? 'pt-12 sm:pt-11' : undefined}>{children}</div>
    </PortalSessionContext.Provider>
  );
}
