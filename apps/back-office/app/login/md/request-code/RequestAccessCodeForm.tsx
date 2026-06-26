'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Mail } from 'lucide-react';

import BrandWatermarkBackground from '../../../../components/portal/BrandWatermarkBackground';
import { requestMdPortalAccessCodeAction } from './actions';

function isWorkEmailReady(value: string): boolean {
  const email = value.trim().toLowerCase();
  const at = email.indexOf('@');
  if (at <= 0) return false;
  const domain = email.slice(at + 1);
  return domain.includes('.');
}

export default function RequestAccessCodeForm({
  logoUrl,
  companyName,
}: {
  logoUrl: string | null;
  companyName?: string | null;
}) {
  const [workEmail, setWorkEmail] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isPending, startTransition] = useTransition();

  const displayCompanyName = companyName?.trim() || 'Classic Venture Security';

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSuccessMsg('');

    startTransition(async () => {
      const result = await requestMdPortalAccessCodeAction(workEmail);
      setSuccessMsg(result.message);
    });
  };

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-white text-slate-900 antialiased">
      <BrandWatermarkBackground logoUrl={logoUrl} mode="sparse" />

      <main className="relative z-10 flex min-h-[100dvh] w-full flex-col items-center justify-center px-4 py-8 sm:px-8">
        <div className="w-full max-w-md space-y-8">
          <div className="space-y-4 text-center">
            <div className="mb-2 flex justify-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-lg">
                <Mail className="h-10 w-10 text-indigo-700" />
              </div>
            </div>
            <div>
              <p className="font-university-roman text-xl uppercase tracking-[0.12em] text-rose-900">
                {displayCompanyName}
              </p>
              <h1 className="mt-3 text-3xl font-black uppercase tracking-tight text-slate-900">
                Request access code
              </h1>
              <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                Restricted access
              </p>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-2xl border border-slate-200/90 bg-white/85 p-6 shadow-sm"
          >
            {successMsg ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center text-xs font-bold text-emerald-800">
                {successMsg}
              </div>
            ) : null}

            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-600">
                Work email
              </label>
              <input
                type="email"
                value={workEmail}
                onChange={(event) => setWorkEmail(event.target.value)}
                placeholder="name@company.com"
                required
                autoComplete="username"
                className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold normal-case tracking-normal text-slate-900 shadow-inner transition-all placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
              />
            </div>

            <button
              type="submit"
              disabled={isPending || !isWorkEmailReady(workEmail)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-4 text-sm font-black uppercase tracking-[0.2em] text-white shadow-md shadow-slate-900/25 transition-all hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50"
            >
              {isPending ? 'Sending…' : 'Submit request'}
            </button>
          </form>

          <p className="text-center text-[11px] font-medium text-slate-500">
            <Link
              href="/login/md"
              className="font-semibold text-indigo-700 underline-offset-2 hover:text-indigo-900 hover:underline"
            >
              Back to MD Portal sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
