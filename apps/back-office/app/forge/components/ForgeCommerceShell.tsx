'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { FORGE_COMMERCE_THEME as C } from './forge-commerce-theme';

const TABS = [
  { href: '/forge/commerce/catalog', label: 'Catalog' },
  { href: '/forge/commerce/pricing', label: 'Pricing' },
  { href: '/forge/commerce/purchases', label: 'Purchases' },
  { href: '/forge/commerce/invoices', label: 'Invoices' },
] as const;

export default function ForgeCommerceShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <div className={`${C.card} overflow-hidden`}>
        <div className="border-b border-slate-200 px-4 py-4 sm:px-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700">Commerce</p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {subtitle ?? 'Standalone product sales — WFM, custom software, and websites.'}
          </p>
        </div>
        <nav
          className="flex gap-1 overflow-x-auto border-b border-slate-200 px-2 sm:px-4"
          aria-label="Commerce sections"
        >
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`shrink-0 border-b-2 px-3 py-3 text-[10px] font-bold uppercase tracking-wider transition-colors sm:px-4 ${
                  active
                    ? 'border-amber-500 text-amber-800'
                    : 'border-transparent text-slate-500 hover:border-slate-200 hover:text-slate-800'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="max-w-6xl">{children}</div>
    </div>
  );
}
