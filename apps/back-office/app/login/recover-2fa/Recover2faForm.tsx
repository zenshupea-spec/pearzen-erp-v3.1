'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { ShieldAlert } from 'lucide-react';

import BrandWatermarkBackground from '../../../components/portal/BrandWatermarkBackground';
import { HEAD_OFFICE_FORGE_2FA_ESCALATION_HINT } from '../../../lib/head-office-totp-backup-client';
import { requestHeadOffice2faRecoveryAction } from './actions';

export default function Recover2faForm({
  logoUrl,
  companyName,
}: {
  logoUrl: string | null;
  companyName?: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState('');
  const displayCompanyName = companyName?.trim() || 'Classic Venture Security';

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMsg('');
    startTransition(async () => {
      const result = await requestHeadOffice2faRecoveryAction();
      if (result?.error) setErrorMsg(result.error);
    });
  };

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-white text-slate-900 antialiased">
      <BrandWatermarkBackground logoUrl={logoUrl} mode="sparse" />

      <main className="relative z-10 flex min-h-[100dvh] w-full flex-col items-center justify-center px-4 py-8 sm:px-8">
        <div className="w-full max-w-md space-y-8">
          <div className="space-y-4 text-center">
            <div className="mb-2 flex justify-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 shadow-lg">
                <ShieldAlert className="h-10 w-10 text-amber-700" />
              </div>
            </div>
            <div>
              <p className="font-university-roman text-xl uppercase tracking-[0.12em] text-rose-900">
                {displayCompanyName}
              </p>
              <h1 className="mt-3 text-3xl font-black uppercase tracking-tight text-slate-900">
                2FA recovery
              </h1>
              <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                After backup-code use and the 120-hour cooldown
              </p>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-2xl border border-slate-200/90 bg-white/85 p-6 shadow-sm"
          >
            {errorMsg ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-xs font-bold text-rose-700">
                {errorMsg}
              </div>
            ) : null}

            <p className="text-sm leading-relaxed text-slate-600">
              Reset clears your authenticator enrollment and backup codes. You will set up 2FA again
              on the next screen. This path is only available after you have used a backup code and
              the cooldown has passed.
            </p>

            <p className="text-xs leading-relaxed text-slate-500">
              Lost your authenticator now? Use a backup code on{' '}
              <Link href="/login/verify-2fa" className="font-semibold text-slate-700 hover:text-slate-900">
                /login/verify-2fa
              </Link>{' '}
              first. {HEAD_OFFICE_FORGE_2FA_ESCALATION_HINT}
            </p>

            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-xl bg-slate-900 py-4 text-sm font-black uppercase tracking-[0.2em] text-white disabled:opacity-50"
            >
              {isPending ? 'Resetting…' : 'Reset and set up 2FA again'}
            </button>
          </form>

          <p className="text-center text-xs font-bold uppercase tracking-wider text-slate-500">
            <Link href="/login/verify-2fa" className="text-slate-700 hover:text-slate-900">
              Back to 2FA check
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
