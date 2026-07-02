'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { fetchForgeWebsiteTemplates } from '../templates/actions';
import { FORGE_PORTAL_THEME as T } from './forge-portal-theme';

export default function ForgeTemplatesCard() {
  const [templateCount, setTemplateCount] = useState(0);
  const [featuredCount, setFeaturedCount] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const result = await fetchForgeWebsiteTemplates();
      if (cancelled) return;

      if (result.success) {
        setLoadError(null);
        setTemplateCount(result.templates.filter((row) => row.isActive).length);
        setFeaturedCount(result.templates.filter((row) => row.isFeatured).length);
      } else {
        setLoadError(result.error ?? 'Could not load templates');
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={`${T.card} overflow-hidden border-sky-200/80 bg-gradient-to-r from-white to-sky-50/30`}>
      <div className="flex h-full flex-col gap-4 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700">Templates</p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">Website gallery</h2>
          <p className="mt-1 text-sm text-slate-500">
            Ready-made landing, menu, and security blueprints for web managers to launch client sites.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-sky-700">
              {templateCount} active template{templateCount === 1 ? '' : 's'}
            </span>
            {featuredCount > 0 ? (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                {featuredCount} featured
              </span>
            ) : null}
          </div>

          {loadError ? <p className="mt-2 text-xs text-amber-600">{loadError}</p> : null}
        </div>

        <Link
          href="/forge/templates"
          className="inline-flex shrink-0 items-center rounded-full border border-sky-300 bg-sky-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-sky-700"
        >
          Open gallery
        </Link>
      </div>
    </div>
  );
}
