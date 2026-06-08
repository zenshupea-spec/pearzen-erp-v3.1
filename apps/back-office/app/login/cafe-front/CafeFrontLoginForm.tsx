'use client';

import Link from 'next/link';
import { useTransition, useState } from 'react';
import { ArrowLeft, Coffee, Radio } from 'lucide-react';

import BrandWatermarkBackground from '../../../components/portal/BrandWatermarkBackground';
import { authenticateCafeFrontStaff } from '../../cafe-front/actions';

export default function CafeFrontLoginForm({
  logoUrl,
  authError,
}: {
  logoUrl: string | null;
  authError?: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState(authError ?? '');

  const handleLogin = (formData: FormData) => {
    setErrorMsg('');
    startTransition(async () => {
      const result = await authenticateCafeFrontStaff(formData);
      if (result?.error) setErrorMsg(result.error);
      else if (result?.success) window.location.href = '/cafe-front';
    });
  };

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-white text-slate-900 antialiased">
      <BrandWatermarkBackground logoUrl={logoUrl} mode="sparse" />

      <main className="relative z-10 flex min-h-[100dvh] flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="absolute left-4 top-6 sm:left-8">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 transition-colors hover:text-slate-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All portals
          </Link>
        </div>

        <div className="mx-auto w-full max-w-sm space-y-8">
          <div className="space-y-4 text-center">
            <div className="mb-2 flex justify-center">
              <div className="relative">
                <div
                  className={`flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl ${
                    logoUrl
                      ? 'border border-slate-200 bg-white shadow-lg shadow-slate-900/10'
                      : 'border border-orange-200 bg-gradient-to-br from-orange-50 to-orange-100 shadow-lg shadow-orange-200/40'
                  }`}
                >
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="" className="h-full w-full object-contain p-2" />
                  ) : (
                    <Coffee className="h-10 w-10 text-orange-700" strokeWidth={1.75} />
                  )}
                </div>
                <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-emerald-500 shadow-sm">
                  <Radio className="h-3 w-3 text-white" strokeWidth={2.5} />
                </span>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-500">
                Café Tasha
              </p>
              <h1 className="mt-2 text-3xl font-black uppercase tracking-tight text-slate-900">
                Front Office
              </h1>
              <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                Counter staff · orders · compliance · expiry
              </p>
            </div>
          </div>

          <form
            action={handleLogin}
            className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-600">
                EPF No
              </label>
              <input
                type="text"
                name="epfNo"
                placeholder="EPF membership number"
                required
                autoCapitalize="characters"
                className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-center font-mono text-xl font-bold uppercase text-slate-900 shadow-inner transition-all placeholder:text-slate-400 focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10"
              />
            </div>

            {errorMsg ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-xs font-bold text-rose-700">
                {errorMsg}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isPending}
              className="mt-2 w-full rounded-xl bg-orange-600 py-4 text-sm font-black uppercase tracking-[0.2em] text-white shadow-md shadow-orange-600/25 transition-all hover:bg-orange-500 active:scale-[0.98] disabled:opacity-50"
            >
              {isPending ? 'Verifying…' : 'Secure access'}
            </button>
          </form>

          <div className="space-y-2 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              GPS · Selfie shift check-in required for orders
            </p>
            <p className="text-[10px] font-mono text-slate-400">
              Activity is audited · misuse is reported to HQ
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
