'use client';

import { useEffect, useState, useTransition } from 'react';

import BackupCodesPanel from '../../../../components/portal/BackupCodesPanel';
import { formatForgeBackupCode } from '../../../../lib/forge-portal-backup';
import {
  confirmForgeTotpSetupAction,
  finishForgeTotpSetupAction,
  loadForgeTotpSetupAction,
} from './actions';

export default function SetupForge2faForm() {
  const [isPending, startTransition] = useTransition();
  const [isFinishing, startFinish] = useTransition();
  const [errorMsg, setErrorMsg] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await loadForgeTotpSetupAction();
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
      setErrorMsg('Enter the 6-digit authenticator code.');
      return;
    }
    startTransition(async () => {
      const result = await confirmForgeTotpSetupAction(code);
      if ('error' in result && result.error) {
        setErrorMsg(result.error);
        return;
      }
      if ('backupCodes' in result && result.backupCodes?.length) {
        setBackupCodes(result.backupCodes);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {backupCodes ? (
        <BackupCodesPanel
          codes={backupCodes}
          formatCode={formatForgeBackupCode}
          description="Store these five 20-digit backup keys offline. Each key works once. Using a backup key starts a 120-hour cooldown before email recovery."
          onContinue={() => {
            startFinish(async () => {
              await finishForgeTotpSetupAction();
            });
          }}
          continueLabel={isFinishing ? 'Continuing…' : 'Continue'}
        />
      ) : (
        <>
          {errorMsg ? (
            <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300">
              {errorMsg}
            </p>
          ) : null}
          {secret ? (
            <div className="space-y-2 text-sm text-slate-300">
              <p>Scan this secret in your authenticator app:</p>
              <p className="break-all font-mono text-xs text-indigo-200">{secret}</p>
              {uri ? (
                <a href={uri} className="text-xs text-indigo-300 underline">
                  Open in authenticator
                </a>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Preparing 2FA…</p>
          )}
          <input
            inputMode="numeric"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6-digit code"
            className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2.5 text-center font-mono text-lg tracking-widest text-white"
          />
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-xl bg-indigo-600 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-60"
          >
            {isPending ? 'Verifying…' : 'Enable 2FA'}
          </button>
        </>
      )}
    </form>
  );
}
