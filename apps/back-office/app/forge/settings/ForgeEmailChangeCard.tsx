'use client';

import { useState, useTransition } from 'react';
import { Mail, Shield } from 'lucide-react';

import type { ForgeEmailField } from '../../../lib/forge-portal-email-change';
import {
  confirmForgeEmailChangeAction,
  requestForgeEmailChangeAction,
} from './account-actions';

type Props = {
  field: ForgeEmailField;
  title: string;
  description: string;
  currentEmail: string | null;
  onUpdated: () => void;
};

export default function ForgeEmailChangeCard({
  field,
  title,
  description,
  currentEmail,
  onUpdated,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [newCode, setNewCode] = useState('');
  const [oldCode, setOldCode] = useState('');
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [requiresOldCode, setRequiresOldCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const reset = () => {
    setExpanded(false);
    setStep('form');
    setNewEmail('');
    setPassword('');
    setTotpCode('');
    setNewCode('');
    setOldCode('');
    setRequiresOldCode(false);
    setError(null);
    setMessage(null);
  };

  const handleRequest = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await requestForgeEmailChangeAction({
        field,
        newEmail,
        password,
        totpCode,
      });
      if ('error' in result && result.error) {
        setError(result.error);
        return;
      }
      setRequiresOldCode(result.requiresOldCode ?? false);
      setStep('confirm');
      setMessage('Verification codes sent. Check your inbox.');
    });
  };

  const handleConfirm = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await confirmForgeEmailChangeAction({
        field,
        newEmail,
        newCode,
        oldCode: requiresOldCode ? oldCode : undefined,
      });
      if ('error' in result && result.error) {
        setError(result.error);
        return;
      }
      if (result.signOutRequired) {
        window.location.href = '/login/forge?message=sign_in_email_updated';
        return;
      }
      setMessage('Email updated successfully.');
      onUpdated();
      reset();
    });
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#0d0d12] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/10">
            <Mail className="h-4 w-4 text-indigo-300" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-white">{title}</h3>
            <p className="mt-1 font-mono text-xs text-slate-400">
              {currentEmail ?? 'Not set'}
            </p>
            <p className="mt-2 text-xs text-slate-500">{description}</p>
          </div>
        </div>
        {!expanded ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="flex-shrink-0 rounded-lg border border-slate-700 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-300 hover:border-indigo-500 hover:text-white"
          >
            Change
          </button>
        ) : null}
      </div>

      {expanded ? (
        <div className="mt-5 border-t border-slate-800 pt-5">
          <div className="mb-4 flex items-center gap-2 text-xs text-amber-400/90">
            <Shield className="h-3.5 w-3.5" />
            Requires your Forge password and a current authenticator code.
          </div>

          {step === 'form' ? (
            <form onSubmit={handleRequest} className="space-y-3">
              <input
                type="email"
                required
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                placeholder="New email address"
                className="w-full rounded-xl border border-slate-700 bg-[#0a0a0e] px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500"
              />
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Forge login password"
                className="w-full rounded-xl border border-slate-700 bg-[#0a0a0e] px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500"
              />
              <input
                inputMode="numeric"
                required
                value={totpCode}
                onChange={(event) =>
                  setTotpCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                }
                placeholder="6-digit authenticator code"
                className="w-full rounded-xl border border-slate-700 bg-[#0a0a0e] px-3 py-2.5 text-center font-mono text-sm tracking-widest text-white outline-none focus:border-indigo-500"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-bold uppercase text-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 rounded-xl bg-indigo-600 py-2 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50"
                >
                  {isPending ? 'Sending…' : 'Send verification codes'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleConfirm} className="space-y-3">
              <p className="text-xs text-slate-400">
                Enter the code sent to <span className="font-mono text-slate-300">{newEmail}</span>
              </p>
              <input
                inputMode="numeric"
                required
                value={newCode}
                onChange={(event) =>
                  setNewCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                }
                placeholder="Code from new email"
                className="w-full rounded-xl border border-slate-700 bg-[#0a0a0e] px-3 py-2.5 text-center font-mono text-sm text-white outline-none focus:border-indigo-500"
              />
              {requiresOldCode ? (
                <>
                  <p className="text-xs text-slate-400">
                    Also enter the code sent to your current sign-in email.
                  </p>
                  <input
                    inputMode="numeric"
                    required
                    value={oldCode}
                    onChange={(event) =>
                      setOldCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    placeholder="Code from current sign-in email"
                    className="w-full rounded-xl border border-slate-700 bg-[#0a0a0e] px-3 py-2.5 text-center font-mono text-sm text-white outline-none focus:border-indigo-500"
                  />
                </>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep('form')}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-bold uppercase text-slate-400"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 rounded-xl bg-emerald-600 py-2 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50"
                >
                  {isPending ? 'Confirming…' : 'Confirm change'}
                </button>
              </div>
            </form>
          )}

          {error ? (
            <p className="mt-3 text-xs font-bold text-rose-400">{error}</p>
          ) : null}
          {message ? (
            <p className="mt-3 text-xs font-bold text-emerald-400">{message}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
