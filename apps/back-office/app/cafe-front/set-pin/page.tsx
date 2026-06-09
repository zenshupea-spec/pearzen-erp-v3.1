'use client';

import { useState, useTransition } from 'react';
import { KeyRound, CheckCircle } from 'lucide-react';

import { CAFE_FRONT_PIN_LENGTH } from '../../../lib/cafe-front-auth';
import { setCafeFrontPinAction } from './actions';

function normalizePinInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, CAFE_FRONT_PIN_LENGTH);
}

export default function CafeFrontSetPinPage() {
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');

  const handleProceedToConfirm = () => {
    if (pin.length !== CAFE_FRONT_PIN_LENGTH) {
      setErrorMsg(`Enter all ${CAFE_FRONT_PIN_LENGTH} digits.`);
      return;
    }
    setErrorMsg('');
    setStep('confirm');
  };

  const handleSetPin = () => {
    if (confirmPin.length !== CAFE_FRONT_PIN_LENGTH) {
      setErrorMsg(`Confirm all ${CAFE_FRONT_PIN_LENGTH} digits.`);
      return;
    }
    if (pin !== confirmPin) {
      setErrorMsg('PINs do not match. Try again.');
      setConfirmPin('');
      setStep('enter');
      setPin('');
      return;
    }
    setErrorMsg('');
    startTransition(async () => {
      const result = await setCafeFrontPinAction(pin);
      if (result?.error) {
        setErrorMsg(result.error);
        return;
      }
      window.location.assign('/cafe-front');
    });
  };

  const activeValue = step === 'enter' ? pin : confirmPin;
  const setActiveValue = step === 'enter' ? setPin : setConfirmPin;

  return (
    <div className="flex min-h-[100dvh] flex-1 flex-col justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mx-auto w-full max-w-sm space-y-8">
        <div className="space-y-3 text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-orange-200 bg-orange-50 shadow-lg shadow-orange-200/40">
              <KeyRound className="h-10 w-10 text-orange-600" />
            </div>
          </div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900">
            {step === 'enter' ? 'Set Your PIN' : 'Confirm PIN'}
          </h1>
          <p className="whitespace-pre-line font-mono text-sm leading-relaxed text-slate-500">
            {step === 'enter'
              ? `Choose a ${CAFE_FRONT_PIN_LENGTH}-digit PIN only you will know.\nYou will use this every time you log in.`
              : 'Re-enter your PIN to confirm.'}
          </p>
        </div>

        <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="space-y-3">
            <p className="text-center text-xs font-black uppercase tracking-widest text-slate-600">
              {step === 'enter' ? 'New PIN' : 'Confirm PIN'}
            </p>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={CAFE_FRONT_PIN_LENGTH}
              value={activeValue}
              onChange={(e) => setActiveValue(normalizePinInput(e.target.value))}
              placeholder={`${CAFE_FRONT_PIN_LENGTH}-digit PIN`}
              className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-4 text-center font-mono text-3xl font-black tracking-[0.5em] text-orange-600 shadow-inner transition-all placeholder:text-base placeholder:tracking-normal placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-500/20"
            />
            <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Type or paste all {CAFE_FRONT_PIN_LENGTH} digits at once
            </p>
          </div>

          {errorMsg ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-sm font-bold text-rose-700">
              {errorMsg}
            </div>
          ) : null}

          {step === 'enter' ? (
            <button
              type="button"
              onClick={handleProceedToConfirm}
              disabled={pin.length !== CAFE_FRONT_PIN_LENGTH}
              className="w-full rounded-xl bg-orange-600 py-4 text-base font-black uppercase tracking-widest text-white transition-all hover:bg-orange-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continue
            </button>
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setStep('enter');
                  setConfirmPin('');
                  setErrorMsg('');
                }}
                className="flex-1 rounded-xl bg-slate-200 py-4 text-sm font-black uppercase tracking-wider text-slate-700 transition-all hover:bg-slate-300 active:scale-95"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleSetPin}
                disabled={isPending || confirmPin.length !== CAFE_FRONT_PIN_LENGTH}
                className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-orange-600 py-4 text-sm font-black uppercase tracking-widest text-white transition-all hover:bg-orange-500 active:scale-95 disabled:opacity-50"
              >
                <CheckCircle className="h-4 w-4" />
                {isPending ? 'Saving…' : 'Set PIN'}
              </button>
            </div>
          )}
        </div>

        <p className="text-center font-mono text-sm text-slate-400">
          This PIN is private. Pearzen staff will never ask for it.
        </p>
      </div>
    </div>
  );
}
