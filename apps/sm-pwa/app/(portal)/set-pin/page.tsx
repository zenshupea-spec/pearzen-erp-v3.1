'use client'

import { useState, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, CheckCircle } from 'lucide-react';
import { setPinAction } from './actions';

export default function SetPinPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState('');
  const [pin, setPin] = useState(['', '', '', '', '', '']);
  const [confirmPin, setConfirmPin] = useState(['', '', '', '', '', '']);
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);
  const confirmRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleDigit = (
    index: number,
    value: string,
    arr: string[],
    setArr: React.Dispatch<React.SetStateAction<string[]>>,
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>
  ) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...arr];
    next[index] = digit;
    setArr(next);
    if (digit && index < 5) {
      refs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    index: number,
    arr: string[],
    setArr: React.Dispatch<React.SetStateAction<string[]>>,
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>
  ) => {
    if (e.key === 'Backspace' && !arr[index] && index > 0) {
      refs.current[index - 1]?.focus();
      const next = [...arr];
      next[index - 1] = '';
      setArr(next);
    }
  };

  const pinValue = pin.join('');
  const confirmValue = confirmPin.join('');

  const handleProceedToConfirm = () => {
    if (pinValue.length !== 6) {
      setErrorMsg('Enter all 6 digits.');
      return;
    }
    setErrorMsg('');
    setStep('confirm');
    setTimeout(() => confirmRefs.current[0]?.focus(), 100);
  };

  const handleSetPin = () => {
    if (confirmValue.length !== 6) {
      setErrorMsg('Confirm all 6 digits.');
      return;
    }
    if (pinValue !== confirmValue) {
      setErrorMsg('PINs do not match. Try again.');
      setConfirmPin(['', '', '', '', '', '']);
      setStep('enter');
      setPin(['', '', '', '', '', '']);
      setTimeout(() => pinRefs.current[0]?.focus(), 100);
      return;
    }
    setErrorMsg('');
    startTransition(async () => {
      const result = await setPinAction(pinValue);
      if (result?.error) {
        setErrorMsg(result.error);
      } else {
        router.replace('/dashboard');
      }
    });
  };

  const PinInput = ({
    arr,
    setArr,
    refs,
  }: {
    arr: string[];
    setArr: React.Dispatch<React.SetStateAction<string[]>>;
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>;
  }) => (
    <div className="flex gap-3 justify-center">
      {arr.map((digit, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el; }}
          type="password"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={e => handleDigit(i, e.target.value, arr, setArr, refs)}
          onKeyDown={e => handleKeyDown(e, i, arr, setArr, refs)}
          className="w-12 h-14 text-center text-2xl font-black bg-white border-2 border-slate-200 rounded-xl text-amber-600 focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all shadow-inner caret-transparent"
        />
      ))}
    </div>
  );

  return (
    <div className="flex-1 flex flex-col justify-center p-6 min-h-[100dvh]">
      <div className="w-full max-w-sm mx-auto space-y-8">

        {/* Header */}
        <div className="text-center space-y-3">
          <div className="flex justify-center mb-4">
            <div className="h-20 w-20 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shadow-[0_0_40px_rgba(245,158,11,0.2)]">
              <KeyRound className="w-10 h-10 text-amber-600" />
            </div>
          </div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">
            {step === 'enter' ? 'Set Your PIN' : 'Confirm PIN'}
          </h1>
          <p className="text-sm text-slate-500 font-mono leading-relaxed">
            {step === 'enter'
              ? 'Choose a 6-digit PIN only you will know.\nYou will use this every time you log in.'
              : 'Re-enter your PIN to confirm.'}
          </p>
        </div>

        {/* PIN Form */}
        <div className="bg-white/90 backdrop-blur-md p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          {step === 'enter' ? (
            <>
              <div className="space-y-3">
                <p className="text-xs text-center font-black text-slate-600 uppercase tracking-widest">
                  New PIN
                </p>
                <PinInput arr={pin} setArr={setPin} refs={pinRefs} />
              </div>
              {errorMsg && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-600 p-3 rounded-xl text-sm text-center font-bold">
                  {errorMsg}
                </div>
              )}
              <button
                onClick={handleProceedToConfirm}
                className="w-full bg-amber-500 hover:bg-amber-400 text-stone-900 font-black text-base py-4 rounded-xl uppercase tracking-widest transition-all active:scale-95"
              >
                Continue
              </button>
            </>
          ) : (
            <>
              <div className="space-y-3">
                <p className="text-xs text-center font-black text-slate-600 uppercase tracking-widest">
                  Confirm PIN
                </p>
                <PinInput arr={confirmPin} setArr={setConfirmPin} refs={confirmRefs} />
              </div>
              {errorMsg && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-600 p-3 rounded-xl text-sm text-center font-bold">
                  {errorMsg}
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => { setStep('enter'); setConfirmPin(['', '', '', '', '', '']); setErrorMsg(''); }}
                  className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-black text-sm py-4 rounded-xl uppercase tracking-wider transition-all active:scale-95"
                >
                  Back
                </button>
                <button
                  onClick={handleSetPin}
                  disabled={isPending}
                  className="flex-[2] bg-amber-500 hover:bg-amber-400 text-stone-900 font-black text-sm py-4 rounded-xl uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  {isPending ? 'SAVING...' : 'SET PIN'}
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-sm text-slate-400 font-mono">
          This PIN is private. Pearzen staff will never ask for it.
        </p>
      </div>
    </div>
  );
}
