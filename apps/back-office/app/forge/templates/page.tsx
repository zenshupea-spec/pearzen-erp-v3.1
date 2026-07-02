'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import {
  forgeWebsiteTemplateVerticalLabel,
  type ForgeWebsiteTemplateRecord,
} from '../../../lib/forge-website-templates';
import {
  tenantPublicSiteTypeLabel,
  type TenantPublicSiteType,
} from '../../../lib/tenant-public-site-types';
import StaffPortalLoading from '../../../components/portal/StaffPortalLoading';
import { FORGE_PORTAL_THEME as T } from '../components/forge-portal-theme';
import { fetchForgeWebsiteTemplates } from './actions';

const SITE_TYPE_ACCENTS: Record<TenantPublicSiteType, string> = {
  landing: 'border-sky-200 bg-sky-50 text-sky-700',
  menu: 'border-amber-200 bg-amber-50 text-amber-700',
  security_marketing: 'border-slate-300 bg-slate-100 text-slate-700',
};

const VERTICAL_FILTERS = [
  'all',
  'general',
  'cafe',
  'retail',
  'salon',
  'security',
  'hospitality',
] as const;

type VerticalFilter = (typeof VERTICAL_FILTERS)[number];

function TemplateCard({ template }: { template: ForgeWebsiteTemplateRecord }) {
  const siteAccent = SITE_TYPE_ACCENTS[template.siteType] ?? SITE_TYPE_ACCENTS.landing;

  return (
    <Link
      href={`/forge/templates/${template.slug}`}
      className={`group block ${T.card} ${T.cardHover} overflow-hidden`}
    >
      <div className="flex h-full flex-col p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${siteAccent}`}
          >
            {tenantPublicSiteTypeLabel(template.siteType)}
          </span>
          {template.isFeatured ? (
            <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700">
              Featured
            </span>
          ) : null}
        </div>

        {template.previewImageUrl ? (
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={template.previewImageUrl}
              alt=""
              className="h-36 w-full object-cover transition-transform group-hover:scale-[1.02]"
            />
          </div>
        ) : (
          <div className="mt-4 flex h-36 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-violet-50/40">
            <span className="text-4xl font-black text-slate-200 group-hover:text-violet-200 transition-colors">
              {template.name.slice(0, 1).toUpperCase()}
            </span>
          </div>
        )}

        <div className="mt-4 flex-1">
          <h2 className="text-base font-bold text-slate-900 group-hover:text-violet-800 transition-colors">
            {template.name}
          </h2>
          {template.tagline ? (
            <p className="mt-1 text-sm text-slate-500">{template.tagline}</p>
          ) : null}
          {template.description ? (
            <p className="mt-2 line-clamp-2 text-xs text-slate-400">{template.description}</p>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {forgeWebsiteTemplateVerticalLabel(template.vertical)}
          </span>
          {!template.isActive ? (
            <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-600">
              Hidden
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export default function ForgeTemplatesPage() {
  const [templates, setTemplates] = useState<ForgeWebsiteTemplateRecord[]>([]);
  const [vertical, setVertical] = useState<VerticalFilter>('all');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      const result = await fetchForgeWebsiteTemplates();
      if (cancelled) return;

      if (result.success) {
        setTemplates(result.templates);
        if (result.templates.length === 0) {
          setLoadError(
            'No templates yet. Apply migration 20260624150000_forge_website_templates.sql on Supabase.',
          );
        } else {
          setLoadError(null);
        }
      } else {
        setLoadError(result.error ?? 'Failed to load templates');
      }
      setIsLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (vertical === 'all') return templates;
    return templates.filter((row) => row.vertical === vertical);
  }, [templates, vertical]);

  const activeCount = templates.filter((row) => row.isActive).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Website templates</h1>
        <p className={`mt-1 ${T.sectionDesc}`}>
          Ready-made site blueprints for web managers. Edit starter copy here — it copies into a
          client&apos;s <span className="font-mono text-xs">tenant_public_sites</span> row when they
          launch.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {VERTICAL_FILTERS.map((value) => {
          const label =
            value === 'all' ? 'All' : forgeWebsiteTemplateVerticalLabel(value);
          const count =
            value === 'all'
              ? templates.length
              : templates.filter((row) => row.vertical === value).length;
          const isActive = vertical === value;

          return (
            <button
              key={value}
              type="button"
              onClick={() => setVertical(value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                isActive
                  ? 'border-violet-300 bg-violet-600 text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:text-violet-700'
              }`}
            >
              {label}
              <span className={`ml-1.5 ${isActive ? 'text-violet-200' : 'text-slate-400'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {!isLoading && templates.length > 0 ? (
        <p className="text-xs text-slate-400">
          {activeCount} active template{activeCount === 1 ? '' : 's'}
          {vertical !== 'all' ? ` · showing ${filtered.length} in this vertical` : ''}
        </p>
      ) : null}

      {isLoading ? (
        <StaffPortalLoading portal="forge" message="Loading template gallery…" className="min-h-[16rem]" />
      ) : loadError && templates.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {loadError}
        </div>
      ) : filtered.length === 0 ? (
        <div className={`${T.card} p-8 text-center text-sm text-slate-500`}>
          No templates in this vertical.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((template) => (
            <TemplateCard key={template.id} template={template} />
          ))}
        </div>
      )}
    </div>
  );
}
