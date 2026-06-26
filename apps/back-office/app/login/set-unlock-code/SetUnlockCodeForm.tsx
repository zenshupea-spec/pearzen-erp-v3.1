'use client';

import { useState, useTransition } from 'react';
import { Shield } from 'lucide-react';

import BrandWatermarkBackground from '../../../components/portal/BrandWatermarkBackground';
import { saveHeadOfficeUnlockCodeAction } from '../../actions/portal-session-actions';

export default function SetUnlockCodeForm({
  logoUrl,
  companyName,
}: {
  logoUrl: string | null;
  companyName?: string | null;
}) {
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMsg('');
    if (code.length !== 6 || confirm.length !== 6) {
      setErrorMsg('Unlock code must be exactly 6 digits.');
      return;
    }
    if (code !== confirm) {
      setErrorMsg('Codes do not match.');
      return;
    }
    startTransition(async () => {
      const result = await saveHeadOfficeUnlockCodeAction(code);
      if (result?.error) setErrorMsg(result.error);
    });
  };

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-white text-slate-900 antialiased">
      <BrandWatermarkBackground logoUrl={logoUrl} mode="sparse" />
      <main className="relative z-10 mx-auto flex min-h-[100dvh] max-w-lg flex-col justify-center px-6 py-12">
        <div className="rounded-2xl border border-slate-200/90 bg-white/90 p-8 shadow-lg backdrop-blur-md">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100">
              <Shield className="h-6 w-6 text-indigo-700" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                {companyName ?? 'Portal security'}
              </p>
              <h1 className="text-xl font-black text-slate-900">Set unlock code</h1>
            </div>
          </div>
          <p className="text-sm text-slate-600">
            Choose a 6-digit code used only when the portal auto-locks after{' '}
            <strong>15 minutes</strong> idle. This is separate from your login password.
          </p>
          {errorMsg ? (
            <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
              {errorMsg}
            </p>
          ) : null}
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-600">
                6-digit unlock code
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-center font-mono text-lg tracking-[0.35em]"
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-600">
                Confirm code
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-center font-mono text-lg tracking-[0.35em]"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-xl bg-slate-900 py-3.5 text-sm font-black uppercase tracking-wider text-white disabled:opacity-50"
            >
              {isPending ? 'Saving…' : 'Save unlock code'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
