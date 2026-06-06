'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  fetchForgeOperatorEmails,
  updateForgeOperatorEmails,
} from './actions';

export default function ForgeSettingsPage() {
  const [email1, setEmail1] = useState('');
  const [email2, setEmail2] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchForgeOperatorEmails()
      .then((emails) => {
        setEmail1(emails[0] ?? '');
        setEmail2(emails[1] ?? '');
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    const result = await updateForgeOperatorEmails(email1, email2);
    setSaving(false);

    if (result.success) {
      setEmail1(result.emails[0] ?? '');
      setEmail2(result.emails[1] ?? '');
      setMessage('Operator emails updated. Only these accounts can sign in to Forge.');
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
            Google operator allowlist
          </p>
        </div>
        <Link
          href="/forge"
          className="text-xs font-bold text-indigo-400 hover:text-white uppercase tracking-wider"
        >
          Back to Forge
        </Link>
      </div>

      <div className="max-w-xl mx-auto px-6 py-8">
        <form
          onSubmit={handleSubmit}
          className="bg-[#111118] border border-slate-800 rounded-2xl p-6 space-y-6 shadow-2xl"
        >
          <p className="text-sm text-slate-400">
            Only the two Google accounts below can sign in at{' '}
            <span className="font-mono text-slate-300">/login/forge</span>. Changes take effect
            immediately.
          </p>

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
            {saving ? 'Saving…' : 'Save operator emails'}
          </button>
        </form>
      </div>
    </div>
  );
}
