'use client';

import { useState, useTransition } from 'react';
import { Shield } from 'lucide-react';

import BrandWatermarkBackground from '../../../components/portal/BrandWatermarkBackground';
import { HO_PORTAL_PIN_LENGTH } from '../../../lib/head-office-portal-auth';
import { setHeadOfficePinAction } from './actions';

function normalizePin(value: string): string {
  return value.replace(/\D/g, '').slice(0, HO_PORTAL_PIN_LENGTH);
}

export default function SetHeadOfficePinForm({
  logoUrl,
  companyName,
}: {
  logoUrl: string | null;
  companyName?: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState<'choose' | 'confirm'>('choose');

  const displayCompanyName = companyName?.trim() || 'Classic Venture Security';

  const handleChoose = (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMsg('');
    if (pin.length !== HO_PORTAL_PIN_LENGTH) {
      setErrorMsg(`Enter all ${HO_PORTAL_PIN_LENGTH} digits.`);
      return;
    }
    setStep('confirm');
  };

  const handleConfirm = (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMsg('');
    if (confirmPin.length !== HO_PORTAL_PIN_LENGTH) {
      setErrorMsg(`Confirm all ${HO_PORTAL_PIN_LENGTH} digits.`);
      return;
    }
    startTransition(async () => {
      const result = await setHeadOfficePinAction(pin, confirmPin);
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
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-900/10">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" className="h-full w-full object-contain p-2" />
                ) : (
                  <Shield className="h-10 w-10 text-slate-700" strokeWidth={1.75} />
                )}
              </div>
            </div>
            <div>
              <p className="font-university-roman text-xl uppercase tracking-[0.12em] text-rose-900 sm:text-2xl">
                {displayCompanyName}
              </p>
              <h1 className="mt-3 text-3xl font-black uppercase tracking-tight text-slate-900 sm:text-4xl">
                Set your PIN
              </h1>
              <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                {step === 'choose'
                  ? `Choose a ${HO_PORTAL_PIN_LENGTH}-digit PIN only you will know`
                  : 'Confirm your PIN'}
              </p>
            </div>
          </div>

          {step === 'choose' ? (
            <form
              onSubmit={handleChoose}
              className="space-y-4 rounded-2xl border border-slate-200/90 bg-white/85 p-6 shadow-sm backdrop-blur-md"
            >
              {errorMsg ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-xs font-bold text-rose-700">
                  {errorMsg}
                </div>
              ) : null}

              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(normalizePin(e.target.value))}
                inputMode="numeric"
                maxLength={HO_PORTAL_PIN_LENGTH}
                autoComplete="new-password"
                placeholder={`${HO_PORTAL_PIN_LENGTH}-digit PIN`}
                className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-center font-mono text-2xl font-black tracking-[0.5em] text-slate-900 shadow-inner transition-all placeholder:text-base placeholder:tracking-normal placeholder:text-slate-400 focus:border-rose-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-rose-500/10"
              />

              <button
                type="submit"
                disabled={pin.length !== HO_PORTAL_PIN_LENGTH}
                className="w-full rounded-xl bg-slate-900 py-4 text-sm font-black uppercase tracking-[0.2em] text-white shadow-md shadow-slate-900/25 transition-all hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50"
              >
                Continue
              </button>
            </form>
          ) : (
            <form
              onSubmit={handleConfirm}
              className="space-y-4 rounded-2xl border border-slate-200/90 bg-white/85 p-6 shadow-sm backdrop-blur-md"
            >
              {errorMsg ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-xs font-bold text-rose-700">
                  {errorMsg}
                </div>
              ) : null}

              <input
                type="password"
                value={confirmPin}
                onChange={(e) => setConfirmPin(normalizePin(e.target.value))}
                inputMode="numeric"
                maxLength={HO_PORTAL_PIN_LENGTH}
                autoComplete="new-password"
                placeholder="Confirm PIN"
                className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-center font-mono text-2xl font-black tracking-[0.5em] text-slate-900 shadow-inner transition-all placeholder:text-base placeholder:tracking-normal placeholder:text-slate-400 focus:border-rose-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-rose-500/10"
              />

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setStep('choose');
                    setConfirmPin('');
                    setErrorMsg('');
                  }}
                  className="flex-1 rounded-xl border border-slate-200 py-4 text-sm font-black uppercase tracking-wider text-slate-600"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isPending || confirmPin.length !== HO_PORTAL_PIN_LENGTH}
                  className="flex-[2] rounded-xl bg-emerald-600 py-4 text-sm font-black uppercase tracking-[0.2em] text-white shadow-md shadow-emerald-600/25 transition-all hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50"
                >
                  {isPending ? 'Saving…' : 'Save PIN'}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
