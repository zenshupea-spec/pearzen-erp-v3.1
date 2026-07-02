"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { Lock, LogOut, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  getVaultPinStatus,
  getVaultSessionPolicy,
  getVaultUnlockSessionStatus,
  refreshVaultUnlockSessionAction,
  verifyVaultUnlockPin,
  clearExecutiveVaultUnlockAction,
} from "../../app/actions/vault-session-actions";
import { signOutHeadOfficePortalAction } from "../../app/actions/portal-session-actions";
import { bindPortalIdleActivity } from "../../lib/portal-idle-activity";

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type ExecutiveVaultSessionContextValue = {
  enabled: boolean;
  locked: boolean;
  autoLockEnabled: boolean;
  idleTimeoutMinutes: number;
  remainingMs: number;
  vaultPinConfigured: boolean;
  pinCheckDone: boolean;
  lockNow: () => void;
  requestUnlock: () => void;
};

const ExecutiveVaultSessionContext =
  createContext<ExecutiveVaultSessionContextValue | null>(null);

export function useExecutiveVaultSession() {
  const ctx = useContext(ExecutiveVaultSessionContext);
  if (!ctx) {
    throw new Error("useExecutiveVaultSession must be used within ExecutiveVaultSessionProvider");
  }
  return ctx;
}

export function useExecutiveVaultSessionOptional() {
  return useContext(ExecutiveVaultSessionContext);
}

const VAULT_LOCKED_STORAGE_KEY = "executive-vault-locked";
const VAULT_MANUAL_LOCK_STORAGE_KEY = "executive-vault-manual-lock";
const VAULT_COOKIE_REFRESH_MS = 60_000;

function readVaultManualLockFromSessionStorage(): boolean {
  try {
    return sessionStorage.getItem(VAULT_MANUAL_LOCK_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function readVaultLockedFromSessionStorage(): boolean {
  try {
    return sessionStorage.getItem(VAULT_LOCKED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function applyVaultSessionFromServer({
  unlockStatus,
  idleMs,
  persistLocked,
  setLocked,
  setManualLock,
  setRemainingMs,
  deadlineRef,
}: {
  unlockStatus: {
    applies: boolean;
    pinConfigured: boolean;
    unlocked: boolean;
  };
  idleMs: number;
  persistLocked: (nextLocked: boolean, manual?: boolean) => void;
  setLocked: (locked: boolean) => void;
  setManualLock: (manual: boolean) => void;
  setRemainingMs: (ms: number) => void;
  deadlineRef: MutableRefObject<number>;
}) {
  const startUnlocked = () => {
    setLocked(false);
    persistLocked(false);
    deadlineRef.current = Date.now() + idleMs;
    setRemainingMs(idleMs);
  };

  if (!unlockStatus.applies || !unlockStatus.pinConfigured) {
    startUnlocked();
    return;
  }

  if (unlockStatus.unlocked) {
    startUnlocked();
    return;
  }

  if (readVaultLockedFromSessionStorage() || readVaultManualLockFromSessionStorage()) {
    setLocked(true);
    setManualLock(readVaultManualLockFromSessionStorage());
    setRemainingMs(0);
    persistLocked(true, readVaultManualLockFromSessionStorage());
    return;
  }

  // Missing unlock cookie after portal auth — start idle timer, do not show overlay.
  startUnlocked();
}

function ExecutiveVaultLockOverlay({
  idleTimeoutMinutes,
  autoLockEnabled,
  manualLock,
  vaultPinConfigured,
  onUnlock,
  onSignOut,
  onNavigateToSetPin,
}: {
  idleTimeoutMinutes: number;
  autoLockEnabled: boolean;
  manualLock: boolean;
  vaultPinConfigured: boolean;
  onUnlock: (pin: string) => Promise<{ ok: boolean; error?: string }>;
  onSignOut: () => Promise<void>;
  onNavigateToSetPin: () => void;
}) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const pinInputRef = useRef<HTMLInputElement>(null);

  const focusPinInput = useCallback(() => {
    window.setTimeout(() => pinInputRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    const onRequestUnlock = () => focusPinInput();
    window.addEventListener("executive-vault-request-unlock", onRequestUnlock);
    return () =>
      window.removeEventListener("executive-vault-request-unlock", onRequestUnlock);
  }, [focusPinInput]);

  useEffect(() => {
    if (vaultPinConfigured) {
      focusPinInput();
    }
  }, [focusPinInput, vaultPinConfigured]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (pin.length !== 4) {
      setError("Enter your 4-digit vault PIN.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await onUnlock(pin);
      if (!result.ok) {
        setError(result.error ?? "Incorrect vault PIN.");
        setPin("");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[320] flex items-center justify-center bg-slate-950/85 px-4 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-2xl border border-slate-700/80 bg-slate-900/95 p-5 shadow-2xl shadow-slate-950/50">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-500/40 bg-indigo-500/10">
          <Lock className="h-5 w-5 text-indigo-300" />
        </div>
        <p className="text-center text-xs font-black uppercase tracking-[0.25em] text-indigo-300">
          Vault locked
        </p>
        <p className="mt-2 text-center text-sm text-slate-400">
          {manualLock
            ? "You locked this session manually."
            : autoLockEnabled
              ? `Paused after ${idleTimeoutMinutes} min with no clicks, scroll, or typing.`
              : "You locked this session manually."}
        </p>

        {vaultPinConfigured ? (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {error ? (
              <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-center text-sm font-semibold text-rose-200">
                {error}
              </p>
            ) : null}

            <input
              ref={pinInputRef}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={pin}
              onChange={(event) => {
                setError("");
                setPin(event.target.value.replace(/\D/g, "").slice(0, 4));
              }}
              placeholder="••••"
              className="w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-center text-lg font-black tracking-[0.45em] text-white focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />

            <button
              type="submit"
              disabled={submitting || pin.length !== 4}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4" />
              {submitting ? "Verifying…" : "Unlock and continue"}
            </button>
          </form>
        ) : (
          <div className="mt-5 space-y-3 text-center">
            <p className="text-sm text-slate-300">
              No vault PIN is set yet. Set one in Executive Access for quick unlock, or sign in
              again to continue.
            </p>
            <button
              type="button"
              onClick={() => {
                onNavigateToSetPin();
                router.push("/executive/access#vault-pin");
              }}
              className="inline-flex w-full items-center justify-center rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-indigo-200 hover:bg-indigo-500/20"
            >
              Set vault PIN
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => void onSignOut()}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-600 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-300 hover:bg-slate-800"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign in again
        </button>
      </div>
    </div>
  );
}

export function ExecutiveVaultSessionProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const router = useRouter();

  const [locked, setLocked] = useState(false);
  const [manualLock, setManualLock] = useState(false);
  const [policy, setPolicy] = useState({
    autoLockEnabled: true,
    idleTimeoutMinutes: 30,
  });
  const [vaultPinConfigured, setVaultPinConfigured] = useState(false);
  const [pinCheckDone, setPinCheckDone] = useState(!enabled);
  const [remainingMs, setRemainingMs] = useState(30 * 60 * 1000);

  const deadlineRef = useRef(Date.now() + 30 * 60 * 1000);
  const signingOutRef = useRef(false);
  const lastCookieRefreshRef = useRef(0);

  const persistLocked = useCallback((nextLocked: boolean, manual = false) => {
    try {
      if (nextLocked) {
        sessionStorage.setItem(VAULT_LOCKED_STORAGE_KEY, "1");
        if (manual) {
          sessionStorage.setItem(VAULT_MANUAL_LOCK_STORAGE_KEY, "1");
        }
      } else {
        sessionStorage.removeItem(VAULT_LOCKED_STORAGE_KEY);
        sessionStorage.removeItem(VAULT_MANUAL_LOCK_STORAGE_KEY);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setPinCheckDone(true);
      return;
    }

    let cancelled = false;
    const loadVaultSession = async () => {
      try {
        const [vaultPolicy, pinStatus, unlockStatus] = await Promise.all([
          getVaultSessionPolicy(),
          getVaultPinStatus(),
          getVaultUnlockSessionStatus(),
        ]);
        if (cancelled) return;
        setPolicy(vaultPolicy);
        setVaultPinConfigured(pinStatus.configured);

        const ms = vaultPolicy.idleTimeoutMinutes * 60 * 1000;
        applyVaultSessionFromServer({
          unlockStatus,
          idleMs: ms,
          persistLocked,
          setLocked,
          setManualLock,
          setRemainingMs,
          deadlineRef,
        });
      } catch {
        /* defaults */
      } finally {
        if (!cancelled) setPinCheckDone(true);
      }
    };

    void loadVaultSession();

    const onPolicyUpdated = () => {
      void loadVaultSession();
    };
    window.addEventListener("executive-vault-policy-updated", onPolicyUpdated);

    return () => {
      cancelled = true;
      window.removeEventListener("executive-vault-policy-updated", onPolicyUpdated);
    };
  }, [enabled, persistLocked]);

  useEffect(() => {
    if (!enabled) return;

    const refreshPinStatus = () => {
      getVaultPinStatus()
        .then((status) => setVaultPinConfigured(status.configured))
        .catch(() => {
          /* ignore */
        });
    };

    window.addEventListener("executive-vault-pin-updated", refreshPinStatus);
    return () => {
      window.removeEventListener("executive-vault-pin-updated", refreshPinStatus);
    };
  }, [enabled]);

  const bumpIdleDeadline = useCallback(() => {
    if (!enabled) return;
    const ms = policy.idleTimeoutMinutes * 60 * 1000;
    deadlineRef.current = Date.now() + ms;
    setRemainingMs(ms);
  }, [enabled, policy.idleTimeoutMinutes]);

  const resetIdleDeadline = useCallback(() => {
    if (!enabled || !policy.autoLockEnabled || locked) return;
    bumpIdleDeadline();
    const now = Date.now();
    if (now - lastCookieRefreshRef.current >= VAULT_COOKIE_REFRESH_MS) {
      lastCookieRefreshRef.current = now;
      void refreshVaultUnlockSessionAction();
    }
  }, [bumpIdleDeadline, enabled, locked, policy.autoLockEnabled]);

  useEffect(() => {
    if (!enabled || !policy.autoLockEnabled || locked || !vaultPinConfigured) return;

    const onActivity = () => resetIdleDeadline();
    const unbind = bindPortalIdleActivity(onActivity);

    const tick = window.setInterval(() => {
      const left = deadlineRef.current - Date.now();
      if (left <= 0) {
        void clearExecutiveVaultUnlockAction();
        setManualLock(false);
        setLocked(true);
        setRemainingMs(0);
        try {
          sessionStorage.setItem(VAULT_LOCKED_STORAGE_KEY, "1");
          sessionStorage.removeItem(VAULT_MANUAL_LOCK_STORAGE_KEY);
        } catch {
          /* ignore */
        }
        return;
      }
      setRemainingMs(left);
    }, 1000);

    return () => {
      unbind();
      window.clearInterval(tick);
    };
  }, [enabled, locked, policy.autoLockEnabled, resetIdleDeadline, vaultPinConfigured]);

  const clearVaultLock = useCallback(() => {
    setLocked(false);
    setManualLock(false);
    persistLocked(false);
  }, [persistLocked]);

  useEffect(() => {
    if (!enabled || !pinCheckDone || vaultPinConfigured || !locked) return;
    clearVaultLock();
  }, [clearVaultLock, enabled, locked, pinCheckDone, vaultPinConfigured]);

  const lockNow = useCallback(() => {
    if (!enabled || !vaultPinConfigured) return;
    void clearExecutiveVaultUnlockAction();
    setManualLock(true);
    setLocked(true);
    setRemainingMs(0);
    persistLocked(true, true);
  }, [enabled, persistLocked, vaultPinConfigured]);

  const requestUnlock = useCallback(() => {
    if (vaultPinConfigured) {
      setLocked(true);
      setRemainingMs(0);
      persistLocked(true);
    }
    window.dispatchEvent(new Event("executive-vault-request-unlock"));
  }, [persistLocked, vaultPinConfigured]);

  const unlockWithPin = useCallback(
    async (pin: string) => {
      const result = await verifyVaultUnlockPin(pin);
      if (result.ok) {
        // Reset deadline before clearing locked — resetIdleDeadline skips while locked.
        bumpIdleDeadline();
        setLocked(false);
        setManualLock(false);
        persistLocked(false);
        window.dispatchEvent(new Event("executive-vault-unlocked"));
      }
      return result;
    },
    [bumpIdleDeadline, persistLocked],
  );

  const handleSignOut = useCallback(async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    persistLocked(false);
    await signOutHeadOfficePortalAction();
    router.replace("/login/md");
    router.refresh();
  }, [persistLocked, router]);

  const value = useMemo<ExecutiveVaultSessionContextValue>(
    () => ({
      enabled,
      locked,
      autoLockEnabled: policy.autoLockEnabled,
      idleTimeoutMinutes: policy.idleTimeoutMinutes,
      remainingMs,
      vaultPinConfigured,
      pinCheckDone,
      lockNow,
      requestUnlock,
    }),
    [
      enabled,
      lockNow,
      locked,
      pinCheckDone,
      policy.autoLockEnabled,
      policy.idleTimeoutMinutes,
      remainingMs,
      requestUnlock,
      vaultPinConfigured,
    ],
  );

  return (
    <ExecutiveVaultSessionContext.Provider value={value}>
      {children}
      {enabled && locked && pinCheckDone && vaultPinConfigured ? (
        <ExecutiveVaultLockOverlay
          idleTimeoutMinutes={policy.idleTimeoutMinutes}
          autoLockEnabled={policy.autoLockEnabled}
          manualLock={manualLock}
          vaultPinConfigured={vaultPinConfigured}
          onUnlock={unlockWithPin}
          onSignOut={handleSignOut}
          onNavigateToSetPin={clearVaultLock}
        />
      ) : null}
    </ExecutiveVaultSessionContext.Provider>
  );
}

export function ExecutiveVaultLockButton({
  collapsed = false,
}: {
  collapsed?: boolean;
}) {
  const vault = useExecutiveVaultSessionOptional();
  if (!vault?.enabled) return null;

  const waiting = !vault.pinCheckDone;

  const title = waiting
    ? "Checking vault PIN…"
    : !vault.vaultPinConfigured
      ? "Set a vault PIN in Security & Access before using vault lock"
      : vault.locked
        ? "Vault locked — tap to unlock"
        : vault.autoLockEnabled
          ? `Lock vault now · auto-lock in ${formatCountdown(vault.remainingMs)}`
          : "Lock vault now";

  const handleClick = () => {
    if (waiting) return;
    if (!vault.vaultPinConfigured) {
      window.location.assign("/executive/access#vault-pin");
      return;
    }
    if (vault.locked) {
      vault.requestUnlock();
      return;
    }
    vault.lockNow();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={title}
      aria-label={title}
      aria-busy={waiting}
      className={`inline-flex flex-shrink-0 items-center justify-center rounded-lg border transition ${
        collapsed ? "h-8 w-8" : "h-8 w-8"
      } ${
        waiting
          ? "cursor-wait border-slate-200 bg-white text-slate-400 opacity-70"
          : vault.locked
            ? "border-indigo-300 bg-indigo-50 text-indigo-700 hover:border-indigo-400 hover:bg-indigo-100"
            : vault.autoLockEnabled
              ? "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 hover:bg-amber-100"
              : "border-slate-200 bg-white text-slate-500 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
      }`}
    >
      <Lock className="h-3.5 w-3.5" />
    </button>
  );
}
