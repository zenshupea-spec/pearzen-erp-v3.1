'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

import { normalizeTenantSlug, tenantBaseDomain, tenantSubdomainUrl } from '../../lib/tenant-host';

export default function SelectTenantPage() {
  const router = useRouter();
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeTenantSlug(slug);
    if (!normalized) {
      setError('Enter a valid tenant slug (lowercase letters, numbers, hyphens).');
      return;
    }
    setError(null);
    window.location.href = tenantSubdomainUrl(normalized, '/login');
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-violet-600">
          Pearzen ERP
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Choose your organization</h1>
        <p className="mt-2 text-sm text-slate-500">
          Enter your tenant slug to open the staff sign-in page on{' '}
          <span className="font-medium text-slate-700">{tenantBaseDomain()}</span>.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-slate-700" htmlFor="tenant-slug">
            Tenant slug
          </label>
          <input
            id="tenant-slug"
            name="tenant-slug"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="e.g. cvs"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-violet-500 focus:ring-2"
            autoComplete="organization"
          />
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <button
            type="submit"
            className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
          >
            Continue to sign in
          </button>
        </form>

        <button
          type="button"
          onClick={() => router.push('/login/forge')}
          className="mt-4 w-full text-center text-xs text-slate-500 hover:text-violet-700"
        >
          Pearzen platform operator? Open Forge
        </button>
      </div>
    </div>
  );
}
