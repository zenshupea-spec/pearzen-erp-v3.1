'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { PEARZEN_WEBSITE_PUBLIC_URL } from '../../../lib/pearzen-website-host';
import { fetchPearzenMarketingMeta } from '../marketing/actions';
import { FORGE_PORTAL_THEME as T } from './forge-portal-theme';

function formatUpdatedAt(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('en-LK', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ForgeMarketingCard() {
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const result = await fetchPearzenMarketingMeta();
      if (cancelled) return;
      if (result.success) {
        setLoadError(null);
        setUpdatedAt(result.updatedAt);
      } else {
        setLoadError(result.error ?? 'Could not load last updated time');
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const updatedLabel = formatUpdatedAt(updatedAt);

  return (
    <div className={`${T.card} overflow-hidden border-emerald-200/80 bg-gradient-to-r from-white to-emerald-50/30`}>
      <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">
            Pearzen marketing
          </p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">pearzen.tech</h2>
          <p className="mt-1 text-sm text-slate-500">
            Your public company site — hero, products, industries, and contact sections.
          </p>
          {updatedLabel ? (
            <p className="mt-2 text-xs text-slate-400">Last saved {updatedLabel}</p>
          ) : loadError ? (
            <p className="mt-2 text-xs text-amber-600">{loadError}</p>
          ) : (
            <p className="mt-2 text-xs text-slate-400">Using default marketing content</p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <a
            href={PEARZEN_WEBSITE_PUBLIC_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 shadow-sm transition-colors hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
          >
            View live
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
          <Link
            href="/pearzen-website"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
          >
            Preview
          </Link>
          <Link
            href="/pearzen-website?edit=1"
            className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            Edit site
          </Link>
        </div>
      </div>
    </div>
  );
}
