'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import {
  fetchForgeOperatorEmails,
  updateForgeOperatorEmails,
} from './actions';
import { fetchForgeAccountEmailsAction } from './account-actions';
import ForgeEmailChangeCard from './ForgeEmailChangeCard';

export default function ForgeSettingsPage() {
  const [email1, setEmail1] = useState('');
  const [email2, setEmail2] = useState('');
  const [allowlistPassword, setAllowlistPassword] = useState('');
  const [allowlistTotp, setAllowlistTotp] = useState('');
  const [accountEmails, setAccountEmails] = useState<{
    mainEmail: string | null;
    recoveryEmail: string | null;
    signInEmail: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAccount = useCallback(async () => {
    const result = await fetchForgeAccountEmailsAction();
    if ('profile' in result && result.profile) {
      setAccountEmails({
        mainEmail: result.profile.mainEmail,
        recoveryEmail: result.profile.recoveryEmail,
        signInEmail: result.profile.signInEmail,
      });
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchForgeOperatorEmails(), loadAccount()])
      .then(([emails]) => {
        setEmail1(emails[0] ?? '');
        setEmail2(emails[1] ?? '');
      })
      .finally(() => setLoading(false));
  }, [loadAccount]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    const result = await updateForgeOperatorEmails(
      email1,
      email2,
      allowlistPassword,
      allowlistTotp,
    );
    setSaving(false);

    if (result.success) {
      setEmail1(result.emails[0] ?? '');
      setEmail2(result.emails[1] ?? '');
      setAllowlistPassword('');
      setAllowlistTotp('');
      setMessage('Operator allowlist updated.');
    } else {
      setError(result.error);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0e] text-slate-200 font-sans pb-20">
      <div className="bg-[#111118] border-b border-indigo-500/20 sticky top-0 z-50 px-6 py-5 flex justify-between items-center shadow-lg shadow-black/40">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight uppercase">
            Forge Access Control
          </h1>
          <p className="text-[10px] text-indigo-400 font-mono font-bold uppercase tracking-widest mt-1">
            Operators · account emails · Google allowlist
          </p>
        </div>
        <Link
          href="/forge"
          className="text-xs font-bold text-indigo-400 hover:text-white uppercase tracking-wider"
        >
          Back to Forge
        </Link>
      </div>

      <div className="max-w-xl mx-auto px-6 py-8 space-y-8">
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <h2 className="text-sm font-black uppercase tracking-wider text-emerald-300">
            Client pricing
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Website manager splits, WFM per-employee rates, and custom software packages — editable
            without a deploy.
          </p>
          <Link
            href="/forge/settings/pricing"
            className="mt-4 inline-flex rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-emerald-500"
          >
            Open pricing settings →
          </Link>
        </section>
        <section className="space-y-4">
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
            Your account emails
          </h2>
          <p className="text-sm text-slate-400">
            Changing any address requires your login password, authenticator code, and email
            verification. Sign-in (Google) changes also require codes on both old and new Gmail.
          </p>
          {loading ? (
            <p className="text-sm text-slate-500 animate-pulse">Loading account…</p>
          ) : accountEmails ? (
            <div className="space-y-3">
              <ForgeEmailChangeCard
                field="sign_in"
                title="Sign-in email (Google)"
                description="The Gmail used for Google OAuth and password login. Add the new address to the allowlist below first, then complete dual verification."
                currentEmail={accountEmails.signInEmail}
                onUpdated={loadAccount}
              />
              <ForgeEmailChangeCard
                field="main"
                title="Main contact email"
                description="Primary contact for Forge notifications. Can differ from your Google sign-in."
                currentEmail={accountEmails.mainEmail}
                onUpdated={loadAccount}
              />
              <ForgeEmailChangeCard
                field="recovery"
                title="Recovery email"
                description="Receives temporary passwords and 2FA recovery messages."
                currentEmail={accountEmails.recoveryEmail}
                onUpdated={loadAccount}
              />
            </div>
          ) : null}
        </section>

        <section>
          <form
            onSubmit={handleSubmit}
            className="bg-[#111118] border border-slate-800 rounded-2xl p-6 space-y-6 shadow-2xl"
          >
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-white">
                Google operator allowlist
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Only these two Google accounts can reach{' '}
                <span className="font-mono text-slate-300">/login/forge</span>. To migrate sign-in
                to a new Gmail, put it in one slot here before using &quot;Change sign-in email&quot;
                above. Saving requires your login password and authenticator code.
              </p>
            </div>

            {loading ? (
              <p className="text-sm text-slate-500 font-mono animate-pulse">Loading allowlist…</p>
            ) : (
              <div className="space-y-4">
                <label className="block space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Operator email 1
                  </span>
                  <input
                    type="email"
                    required
                    value={email1}
                    onChange={(event) => setEmail1(event.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-[#0a0a0e] px-4 py-3 text-sm text-white outline-none focus:border-indigo-500"
                    placeholder="operator@example.com"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Operator email 2
                  </span>
                  <input
                    type="email"
                    required
                    value={email2}
                    onChange={(event) => setEmail2(event.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-[#0a0a0e] px-4 py-3 text-sm text-white outline-none focus:border-indigo-500"
                    placeholder="operator@example.com"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Login password
                  </span>
                  <input
                    type="password"
                    required
                    value={allowlistPassword}
                    onChange={(event) => setAllowlistPassword(event.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-[#0a0a0e] px-4 py-3 text-sm text-white outline-none focus:border-indigo-500"
                    autoComplete="current-password"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Authenticator code
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    maxLength={6}
                    value={allowlistTotp}
                    onChange={(event) =>
                      setAllowlistTotp(event.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    className="w-full rounded-xl border border-slate-700 bg-[#0a0a0e] px-4 py-3 text-sm font-mono text-white outline-none focus:border-indigo-500"
                    placeholder="000000"
                  />
                </label>
              </div>
            )}

            {message ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                {message}
              </div>
            ) : null}

            {error ? (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading || saving}
              className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black uppercase tracking-wider text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save allowlist'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
