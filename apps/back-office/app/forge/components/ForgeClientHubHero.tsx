'use client';

import Link from 'next/link';

import { FORGE_PORTAL_THEME as T } from './forge-portal-theme';

const SEGMENTS = [
  {
    href: '/forge/clients?segment=wfm',
    label: 'WFM Tool',
    description: 'Per-employee subscribers',
    accent: 'border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100',
  },
  {
    href: '/forge/clients?segment=custom',
    label: 'Custom Software',
    description: 'Milestones & handover',
    accent: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100',
  },
  {
    href: '/forge/clients?segment=websites',
    label: 'Web Managers',
    description: 'Website clients & billings',
    accent: 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
  },
] as const;

export default function ForgeClientHubHero() {
  return (
    <section id="clients" className="space-y-4">
      <Link
        href="/forge/clients"
        className={`group block ${T.card} ${T.cardHover} overflow-hidden border-violet-300 bg-gradient-to-br from-violet-600 via-violet-600 to-indigo-700 p-6 text-white shadow-md shadow-violet-200/50 sm:p-8`}
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-violet-200">
              Start here
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Client hub</h2>
            <p className="mt-2 max-w-xl text-sm text-violet-100">
              Your Pearzen.tech overwatch for WFM subscribers, custom software builds, and web managers
              with their website clients — billings, sites, and PEARS listings.
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-white/30 bg-white/15 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white backdrop-blur transition-colors group-hover:bg-white/25 lg:self-center">
            Open hub
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </Link>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {SEGMENTS.map((segment) => (
          <Link
            key={segment.href}
            href={segment.href}
            className={`rounded-2xl border px-4 py-4 transition-colors ${segment.accent}`}
          >
            <p className="text-sm font-bold">{segment.label}</p>
            <p className="mt-1 text-xs opacity-80">{segment.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
