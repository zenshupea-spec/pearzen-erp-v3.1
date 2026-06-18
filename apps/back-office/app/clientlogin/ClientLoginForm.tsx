'use client';

import Link from 'next/link';
import { useState } from 'react';
import { LayoutDashboard } from 'lucide-react';

import { useSecurityWebsite } from '../security-website/components/SecurityWebsiteContext';

export default function ClientLoginForm() {
  const { ui } = useSecurityWebsite();
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage(ui.clientPortalNoAccess);
  };

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-700">
            <LayoutDashboard className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">{ui.navClientPortal}</h1>
          <p className="mt-2 text-sm text-slate-500">{ui.clientPortalSignIn}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="client-email" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              {ui.clientPortalEmail}
            </label>
            <input
              id="client-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none ring-red-200 focus:border-red-300 focus:ring-2"
            />
          </div>
          <div>
            <label htmlFor="client-password" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              {ui.clientPortalPassword}
            </label>
            <input
              id="client-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none ring-red-200 focus:border-red-300 focus:ring-2"
            />
          </div>

          {message ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {message}
            </p>
          ) : (
            <p className="text-xs text-slate-500">{ui.clientPortalHint}</p>
          )}

          <button type="submit" className="cv-btn-primary w-full rounded-xl py-3 text-sm font-semibold">
            {ui.navClientPortal}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          <Link href="/security-website/contact" className="font-medium text-red-800 hover:underline">
            {ui.navContact}
          </Link>
        </p>
      </div>
    </div>
  );
}
