'use client';

import { authenticateGuard } from './actions';
import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Radio } from 'lucide-react';

export default function FieldLoginForm({ logoUrl }: { logoUrl: string | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = (formData: FormData) => {
    setErrorMsg('');
    startTransition(async () => {
      const result = await authenticateGuard(formData);
      if (result?.success) {
        router.replace('/');
        router.refresh();
        return;
      }
      if (result?.error) {
        setErrorMsg(result.error);
      }
    });
  };

  return (
    <div className="relative z-10 flex min-h-[100dvh] flex-1 flex-col justify-center p-6">
      <div className="mx-auto w-full max-w-sm space-y-8">
        <div className="space-y-4 text-center">
          <div className="mb-2 flex justify-center">
            <div className="relative">
              <div
                className={`flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl ${
                  logoUrl
                    ? 'border border-slate-200 bg-white shadow-lg shadow-slate-900/10'
                    : 'border border-slate-700/20 bg-gradient-to-br from-slate-800 to-slate-900 shadow-lg shadow-slate-900/30'
                }`}
              >
                {logoUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={logoUrl}
                    alt=""
                    className="h-full w-full object-contain p-2"
                  />
                ) : (
                  <Shield className="h-10 w-10 text-slate-100" strokeWidth={1.75} />
                )}
              </div>
              <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-slate-50 bg-emerald-500 shadow-sm">
                <Radio className="h-3 w-3 text-white" strokeWidth={2.5} />
              </span>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-500">
              Classic Venture Security
            </p>
            <h1 className="mt-2 text-3xl font-black uppercase tracking-tight text-slate-900">
              Guard Portal
            </h1>
            <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
              Authorised personnel · Field check-in
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
              className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-center font-mono text-xl font-bold uppercase text-slate-900 shadow-inner transition-all placeholder:text-slate-400 focus:border-slate-800 focus:bg-white focus:outline-none focus:ring-4 focus:ring-slate-900/10"
            />
          </div>

          {errorMsg && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-xs font-bold text-rose-700">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="mt-2 w-full rounded-xl bg-slate-900 py-4 text-sm font-black uppercase tracking-[0.2em] text-white shadow-md shadow-slate-900/25 transition-all hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
          >
            {isPending ? 'Verifying…' : 'Secure access'}
          </button>
        </form>

        <div className="space-y-2 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            GPS · NFC · Selfie verification
          </p>
          <p className="text-[10px] font-mono text-slate-400">
            Misuse is logged and reported to HQ
          </p>
        </div>
      </div>
    </div>
  );
}
