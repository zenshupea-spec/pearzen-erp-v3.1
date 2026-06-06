'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { createNewTenant, fetchDefaultOdEmail } from './actions';

export default function OnboardTenantPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    companyName: '',
    slug: '',
    mdEmail: '',
    odEmail: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDefaultOdEmail().then((email) => {
      if (email) {
        setFormData((prev) => (prev.odEmail ? prev : { ...prev, odEmail: email }));
      }
    });
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    if (error) setError(null);
  };

  const handleSave = async () => {
    if (!formData.companyName.trim() || !formData.slug.trim() || !formData.mdEmail.trim() || !formData.odEmail.trim()) {
      setError('Company name, slug, MD email, and OD email are required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await createNewTenant(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }

      router.push('/forge');
      router.refresh();
    } catch (submitError: unknown) {
      const message = submitError instanceof Error ? submitError.message : 'Tenant deployment failed.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0e] text-slate-200 font-sans pb-20">
      <div className="bg-[#111118] border-b border-indigo-500/20 sticky top-0 z-50 px-6 py-4 flex items-center gap-4 shadow-lg">
        <Link
          href="/forge"
          className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-black text-white tracking-tight uppercase">Onboard New Tenant</h1>
          <p className="text-[10px] text-indigo-400 font-mono uppercase tracking-widest mt-0.5">
            Seeds company, MD/OD employees, and default MD settings in Supabase
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSubmitting}
          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-lg shadow-lg shadow-indigo-500/20 disabled:opacity-50 transition-all uppercase tracking-wider"
        >
          {isSubmitting ? 'DEPLOYING...' : 'DEPLOY TENANT'}
        </button>
      </div>

      {error ? (
        <div className="max-w-2xl mx-auto px-6 mt-4">
          <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        </div>
      ) : null}

      <div className="max-w-2xl mx-auto px-6 py-12 space-y-8">
        <section className="bg-[#111118] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="bg-slate-900/50 px-6 py-4 border-b border-slate-800">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Instance Details</h2>
          </div>
          <div className="p-6 space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-300 uppercase tracking-wider">
                Registered Company Name
              </label>
              <p className="text-xs text-slate-500 mb-2">
                Appears on payslips and invoices. Stored in ALL CAPS.
              </p>
              <input
                type="text"
                name="companyName"
                placeholder="e.g., CLASSIC VENTURE SECURITY"
                value={formData.companyName}
                onChange={handleChange}
                className="w-full bg-[#0a0a0e] border border-slate-800 rounded-xl px-4 py-3 text-white font-bold uppercase focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-300 uppercase tracking-wider">
                System Domain (Slug)
              </label>
              <div className="flex items-center">
                <input
                  type="text"
                  name="slug"
                  placeholder="classic-venture"
                  value={formData.slug}
                  onChange={handleChange}
                  className="flex-1 bg-[#0a0a0e] border border-slate-800 rounded-l-xl px-4 py-3 text-white font-mono lowercase focus:outline-none focus:border-indigo-500 transition-colors"
                />
                <div className="bg-slate-800 border-y border-r border-slate-800 rounded-r-xl px-4 py-3 text-slate-500 font-mono">
                  .pearzen.com
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#111118] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="bg-slate-900/50 px-6 py-4 border-b border-slate-800">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">
              Portal Owners (Google Sign-In)
            </h2>
          </div>
          <div className="p-6 space-y-6">
            <p className="text-xs text-slate-500 leading-relaxed">
              These emails are written to the Master Nominal Roll as MD and OD employees. When those
              users sign in with Google, they land in the Executive Vault and HQ Hub. Only MD and OD
              can edit each other&apos;s MNR records.
            </p>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-300 uppercase tracking-wider">
                Managing Director Email (MD)
              </label>
              <input
                type="email"
                name="mdEmail"
                placeholder="md@client-company.com"
                value={formData.mdEmail}
                onChange={handleChange}
                className="w-full bg-[#0a0a0e] border border-slate-800 rounded-xl px-4 py-3 text-white font-mono lowercase focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-300 uppercase tracking-wider">
                Operations Director Email (OD)
              </label>
              <p className="text-xs text-slate-500 mb-2">
                Software owner / platform liaison. Pre-filled from Forge operator allowlist.
              </p>
              <input
                type="email"
                name="odEmail"
                placeholder="owner@pearzen.com"
                value={formData.odEmail}
                onChange={handleChange}
                className="w-full bg-[#0a0a0e] border border-slate-800 rounded-xl px-4 py-3 text-white font-mono lowercase focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
