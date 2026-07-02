'use client';

import { useEffect } from 'react';

export default function LoginError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Portal login error', error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-black uppercase tracking-wide text-slate-900">
          Sign-in interrupted
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          Something went wrong loading the step after sign-in. Sign in again with your work email
          and OTP or password.
        </p>
        {error.digest ? (
          <p className="mt-4 font-mono text-xs text-slate-400">Reference: {error.digest}</p>
        ) : null}
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"
          >
            Try again
          </button>
          <a
            href="/login/md"
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
          >
            Back to MD Portal login
          </a>
        </div>
      </div>
    </div>
  );
}
