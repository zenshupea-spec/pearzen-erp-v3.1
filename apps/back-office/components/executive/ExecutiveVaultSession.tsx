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
  type ReactNode,
} from "react";
import { Lock, LogOut, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  getVaultPinStatus,
  getVaultSessionPolicy,
  verifyVaultUnlockPin,
} from "../../app/actions/vault-session-actions";
import { createSupabaseBrowserClient } from "../../../../packages/supabase/client";

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

function ExecutiveVaultLockOverlay({
  idleTimeoutMinutes,
  autoLockEnabled,
  vaultPinConfigured,
  onUnlock,
  onSignOut,
}: {
  idleTimeoutMinutes: number;
  autoLockEnabled: boolean;
  vaultPinConfigured: boolean;
  onUnlock: (pin: string) => Promise<{ ok: boolean; error?: string }>;
  onSignOut: () => Promise<void>;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showUnlockForm, setShowUnlockForm] = useState(false);
  const pinInputRef = useRef<HTMLInputElement>(null);

  const openUnlockForm = useCallback(() => {
    setShowUnlockForm(true);
    window.setTimeout(() => pinInputRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    const onRequestUnlock = () => openUnlockForm();
    window.addEventListener("executive-vault-request-unlock", onRequestUnlock);
    return () =>
      window.removeEventListener("executive-vault-request-unlock", onRequestUnlock);
  }, [openUnlockForm]);

  useEffect(() => {
    if (showUnlockForm && vaultPinConfigured) {
      pinInputRef.current?.focus();
    }
  }, [showUnlockForm, vaultPinConfigured]);

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
    <>
      {/* Block interaction with the page while locked, but keep the UI fully visible. */}
      <div className="fixed inset-0 z-[299]" aria-hidden />

      <div className="pointer-events-none fixed inset-x-0 top-3 z-[300] flex justify-center px-4">
        <button
          type="button"
          onClick={() => {
            if (vaultPinConfigured) {
              openUnlockForm();
            } else {
              setShowUnlockForm(true);
            }
          }}
          title={
            vaultPinConfigured
              ? "Vault locked — tap to enter PIN"
              : "Vault locked — tap to sign in or set a PIN"
          }
          aria-label="Vault locked — tap to unlock"
          className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-400/60 bg-white/90 text-indigo-700 shadow-md shadow-slate-900/10 transition-transform hover:scale-105 active:scale-95"
        >
          <Lock className="h-4 w-4" />
        </button>
      </div>

      {showUnlockForm ? (
        <div
          className="fixed inset-0 z-[301] flex items-start justify-center bg-slate-950/40 px-4 pt-16"
          onClick={() => setShowUnlockForm(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-700/80 bg-slate-900/95 p-5 shadow-2xl shadow-slate-950/50"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-center text-xs font-black uppercase tracking-[0.25em] text-indigo-300">
              Vault locked
            </p>
            <p className="mt-2 text-center text-sm text-slate-400">
              {autoLockEnabled
                ? `Paused after ${idleTimeoutMinutes} min idle or manual lock.`
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
                <a
                  href="/executive/access#vault-pin"
                  className="inline-flex w-full items-center justify-center rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-indigo-200 hover:bg-indigo-500/20"
                >
                  Set vault PIN
                </a>
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

            <button
              type="button"
              onClick={() => setShowUnlockForm(false)}
              className="mt-3 w-full text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </>
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
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [locked, setLocked] = useState(false);
  const [policy, setPolicy] = useState({
    autoLockEnabled: true,
    idleTimeoutMinutes: 30,
  });
  const [vaultPinConfigured, setVaultPinConfigured] = useState(false);
  const [pinCheckDone, setPinCheckDone] = useState(!enabled);
  const [remainingMs, setRemainingMs] = useState(30 * 60 * 1000);

  const deadlineRef = useRef(Date.now() + 30 * 60 * 1000);
  const signingOutRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    try {
      if (sessionStorage.getItem(VAULT_LOCKED_STORAGE_KEY) === "1") {
        setLocked(true);
        setRemainingMs(0);
      }
    } catch {
      /* ignore */
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setPinCheckDone(true);
      return;
    }

    let cancelled = false;
    const loadVaultSession = async () => {
      try {
        const [vaultPolicy, pinStatus] = await Promise.all([
          getVaultSessionPolicy(),
          getVaultPinStatus(),
        ]);
        if (cancelled) return;
        setPolicy(vaultPolicy);
        setVaultPinConfigured(pinStatus.configured);
        const ms = vaultPolicy.idleTimeoutMinutes * 60 * 1000;
        deadlineRef.current = Date.now() + ms;
        setRemainingMs(ms);
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
  }, [enabled]);

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
    window.addEventListener("focus", refreshPinStatus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refreshPinStatus();
    });
    return () => {
      window.removeEventListener("executive-vault-pin-updated", refreshPinStatus);
      window.removeEventListener("focus", refreshPinStatus);
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
  }, [bumpIdleDeadline, enabled, locked, policy.autoLockEnabled]);

  useEffect(() => {
    if (!enabled || !policy.autoLockEnabled || locked) return;

    const onActivity = () => resetIdleDeadline();
    const events = ["mousedown", "keydown", "touchstart", "scroll"] as const;
    events.forEach((event) =>
      window.addEventListener(event, onActivity, { passive: true }),
    );

    const tick = window.setInterval(() => {
      const left = deadlineRef.current - Date.now();
      if (left <= 0) {
        setLocked(true);
        setRemainingMs(0);
        try {
          sessionStorage.setItem(VAULT_LOCKED_STORAGE_KEY, "1");
        } catch {
          /* ignore */
        }
        return;
      }
      setRemainingMs(left);
    }, 1000);

    return () => {
      events.forEach((event) => window.removeEventListener(event, onActivity));
      window.clearInterval(tick);
    };
  }, [enabled, locked, policy.autoLockEnabled, resetIdleDeadline]);

  const persistLocked = useCallback((nextLocked: boolean) => {
    try {
      if (nextLocked) {
        sessionStorage.setItem(VAULT_LOCKED_STORAGE_KEY, "1");
      } else {
        sessionStorage.removeItem(VAULT_LOCKED_STORAGE_KEY);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const lockNow = useCallback(() => {
    if (!enabled) return;
    setLocked(true);
    setRemainingMs(0);
    persistLocked(true);
  }, [enabled, persistLocked]);

  const requestUnlock = useCallback(() => {
    window.dispatchEvent(new Event("executive-vault-request-unlock"));
  }, []);

  const unlockWithPin = useCallback(
    async (pin: string) => {
      const result = await verifyVaultUnlockPin(pin);
      if (result.ok) {
        // Reset deadline before clearing locked — resetIdleDeadline skips while locked.
        bumpIdleDeadline();
        setLocked(false);
        persistLocked(false);
      }
      return result;
    },
    [bumpIdleDeadline, persistLocked],
  );

  const handleSignOut = useCallback(async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    persistLocked(false);
    await supabase.auth.signOut();
    router.replace("/login/md");
    router.refresh();
  }, [persistLocked, router, supabase]);

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
      {enabled && locked ? (
        <ExecutiveVaultLockOverlay
          idleTimeoutMinutes={policy.idleTimeoutMinutes}
          autoLockEnabled={policy.autoLockEnabled}
          vaultPinConfigured={vaultPinConfigured}
          onUnlock={unlockWithPin}
          onSignOut={handleSignOut}
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
    : vault.locked
      ? "Vault locked — tap to unlock"
      : vault.autoLockEnabled
        ? `Lock vault now · auto-lock in ${formatCountdown(vault.remainingMs)}`
        : "Lock vault now";

  const handleClick = () => {
    if (waiting) return;
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
