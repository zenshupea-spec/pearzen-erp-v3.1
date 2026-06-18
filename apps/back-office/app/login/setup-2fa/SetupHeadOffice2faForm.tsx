'use client';

import { useEffect, useState, useTransition } from 'react';
import { Shield, Smartphone } from 'lucide-react';

import BrandWatermarkBackground from '../../../components/portal/BrandWatermarkBackground';
import BackupCodesPanel from '../../../components/portal/BackupCodesPanel';
import {
  confirmHeadOfficeTotpSetupAction,
  finishHeadOfficeTotpSetupAction,
  loadHeadOfficeTotpSetupAction,
} from './actions';

export default function SetupHeadOffice2faForm({
  logoUrl,
  companyName,
}: {
  logoUrl: string | null;
  companyName?: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [isFinishing, startFinish] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await loadHeadOfficeTotpSetupAction();
      if (cancelled) return;
      if ('error' in result && result.error) {
        setErrorMsg(result.error);
        return;
      }
      if ('secret' in result && result.secret) {
        setSecret(result.secret);
        setUri(result.uri ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMsg('');
    if (code.length !== 6) {
      setErrorMsg('Enter the 6-digit code from your authenticator app.');
      return;
    }
    startTransition(async () => {
      const result = await confirmHeadOfficeTotpSetupAction(code);
      if ('error' in result && result.error) {
        setErrorMsg(result.error);
        return;
      }
      if ('backupCodes' in result && result.backupCodes?.length) {
        setBackupCodes(result.backupCodes);
      }
    });
  };

  const handleFinish = () => {
    startFinish(async () => {
      const result = await finishHeadOfficeTotpSetupAction();
      if (result && 'error' in result && result.error) {
        setErrorMsg(result.error);
      }
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
                Enable 2FA
              </h1>
              <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                Required for all Head Office portal access
              </p>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-2xl border border-slate-200/90 bg-white/85 p-6 shadow-sm"
          >
            {backupCodes ? (
              <BackupCodesPanel
                codes={backupCodes}
                onContinue={handleFinish}
                continueLabel={isFinishing ? 'Continuing…' : 'Continue to portal'}
              />
            ) : (
              <>
                {errorMsg ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-xs font-bold text-rose-700">
                    {errorMsg}
                  </div>
                ) : null}

                <div className="flex items-start gap-3 rounded-xl border border-violet-100 bg-violet-50/80 p-4 text-xs text-violet-900">
                  <Smartphone className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="space-y-2">
                    <p className="font-bold uppercase tracking-wider">Authenticator app</p>
                    <p>
                      Scan the setup key in Google Authenticator, Microsoft Authenticator, or
                      Authy, then enter the 6-digit code to confirm. You will receive 5 backup
                      codes to keep safe.
                    </p>
                    {secret ? (
                      <p className="break-all font-mono text-[11px] font-bold text-violet-800">
                        {secret}
                      </p>
                    ) : (
                      <p className="text-violet-700">Generating setup key…</p>
                    )}
                    {uri ? (
                      <p className="break-all font-mono text-[10px] text-violet-700/80">{uri}</p>
                    ) : null}
                  </div>
                </div>

                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="one-time-code"
                  placeholder="6-digit authenticator code"
                  className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-center font-mono text-2xl font-black tracking-[0.5em] text-slate-900"
                />

                <button
                  type="submit"
                  disabled={isPending || !secret || code.length !== 6}
                  className="w-full rounded-xl bg-emerald-600 py-4 text-sm font-black uppercase tracking-[0.2em] text-white disabled:opacity-50"
                >
                  {isPending ? 'Enabling…' : 'Enable 2FA'}
                </button>
              </>
            )}
          </form>
        </div>
      </main>
    </div>
  );
}
