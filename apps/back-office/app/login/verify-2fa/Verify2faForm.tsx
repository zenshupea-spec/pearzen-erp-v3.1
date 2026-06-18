'use client';

import { useState, useTransition } from 'react';
import { Shield } from 'lucide-react';

import BrandWatermarkBackground from '../../../components/portal/BrandWatermarkBackground';
import { isHeadOfficeBackupCodeInput } from '../../../lib/head-office-totp-backup-client';
import { verifyHeadOfficeTotpAction } from './actions';

export default function Verify2faForm({
  logoUrl,
  companyName,
}: {
  logoUrl: string | null;
  companyName?: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState('');
  const [code, setCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMsg('');
    if (useBackupCode) {
      if (!isHeadOfficeBackupCodeInput(code)) {
        setErrorMsg('Enter an 8-character backup code (e.g. ABCD-1234).');
        return;
      }
    } else if (code.length !== 6) {
      setErrorMsg('Enter the 6-digit authenticator code.');
      return;
    }
    startTransition(async () => {
      const result = await verifyHeadOfficeTotpAction(code);
      if (result?.error) setErrorMsg(result.error);
    });
  };

  const displayCompanyName = companyName?.trim() || 'Classic Venture Security';

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-white text-slate-900 antialiased">
      <BrandWatermarkBackground logoUrl={logoUrl} mode="sparse" />

      <main className="relative z-10 flex min-h-[100dvh] w-full flex-col items-center justify-center px-4 py-8 sm:px-8">
        <div className="w-full max-w-md space-y-8">
          <div className="space-y-4 text-center">
            <div className="mb-2 flex justify-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-lg">
                <Shield className="h-10 w-10 text-slate-700" />
              </div>
            </div>
            <div>
              <p className="font-university-roman text-xl uppercase tracking-[0.12em] text-rose-900">
                {displayCompanyName}
              </p>
              <h1 className="mt-3 text-3xl font-black uppercase tracking-tight text-slate-900">
                Two-factor check
              </h1>
              <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                {useBackupCode
                  ? 'Enter one of your saved backup codes'
                  : 'Enter your authenticator app code'}
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

            <input
              type="text"
              value={code}
              onChange={(e) => {
                const raw = e.target.value;
                setCode(
                  useBackupCode
                    ? raw.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 9)
                    : raw.replace(/\D/g, '').slice(0, 6),
                );
              }}
              inputMode={useBackupCode ? 'text' : 'numeric'}
              maxLength={useBackupCode ? 9 : 6}
              autoComplete="one-time-code"
              placeholder={useBackupCode ? 'XXXX-XXXX' : '6-digit code'}
              className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-center font-mono text-2xl font-black tracking-[0.5em] text-slate-900"
            />

            <button
              type="button"
              onClick={() => {
                setUseBackupCode((prev) => !prev);
                setCode('');
                setErrorMsg('');
              }}
              className="w-full text-center text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800"
            >
              {useBackupCode ? 'Use authenticator code instead' : "Can't reach authenticator? Use backup code"}
            </button>

            <button
              type="submit"
              disabled={
                isPending ||
                (useBackupCode ? !isHeadOfficeBackupCodeInput(code) : code.length !== 6)
              }
              className="w-full rounded-xl bg-slate-900 py-4 text-sm font-black uppercase tracking-[0.2em] text-white disabled:opacity-50"
            >
              {isPending ? 'Verifying…' : 'Continue'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
