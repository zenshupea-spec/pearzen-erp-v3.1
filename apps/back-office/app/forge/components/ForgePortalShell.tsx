'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import ForgeBreadcrumbs from './ForgeBreadcrumbs';
import { FORGE_PORTAL_THEME as T } from './forge-portal-theme';

export default function ForgePortalShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === '/forge';

  return (
    <div className={T.page}>
      <header className={T.header}>
        <div className={`${T.container} flex items-center gap-3 px-4 py-3.5 md:px-8`}>
          {!isHome ? (
            <Link href="/forge" className={T.backButton} aria-label="Back to Forge home">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
          ) : null}

          <Link href="/forge" className="group flex min-w-0 flex-1 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-100 bg-violet-50 text-violet-600 shadow-sm transition-transform group-hover:scale-105">
              <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </span>
            <div className="min-w-0">
              <p className={T.headerTitle}>Pearzen Forge</p>
              <p className={T.headerSubtitle}>
                {isHome ? 'Pearzen.tech overwatch' : 'SaaS platform console'}
              </p>
            </div>
          </Link>

          {isHome ? (
            <nav className="hidden items-center gap-5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 sm:flex">
              <a href="#clients" className="transition-colors hover:text-violet-600">
                Clients
              </a>
              <a href="#overwatch" className="transition-colors hover:text-emerald-600">
                Overwatch
              </a>
              <a href="#operations" className="transition-colors hover:text-sky-600">
                Operations
              </a>
              <a href="#tenants" className="transition-colors hover:text-indigo-600">
                Tenants
              </a>
            </nav>
          ) : null}
        </div>
      </header>

      <ForgeBreadcrumbs />

      <div className={`${T.container} px-4 pb-24 pt-4 sm:pt-6 md:px-8 md:pt-8`}>{children}</div>
    </div>
  );
}
