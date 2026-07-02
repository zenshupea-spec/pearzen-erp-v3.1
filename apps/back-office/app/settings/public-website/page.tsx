'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';

import type { TenantLandingWebsiteContent, TenantMenuWebsiteContent } from '../../../lib/tenant-public-site-types';
import {
  fetchPublicWebsiteEditorData,
  fetchSecuritySitePublishStatus,
  publishSecurityMarketingWebsite,
  publishTenantLandingWebsite,
  publishTenantMenuWebsite,
  saveTenantLandingWebsiteDraft,
  saveTenantMenuWebsiteDraft,
  unpublishTenantPublicWebsite,
  type PublicWebsiteEditorSite,
} from './actions';

type EditorTab = 'security_marketing' | 'landing' | 'menu';

function formatPublishedAt(value: string | null): string {
  if (!value) return 'Draft only';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function PublicWebsiteSettingsPage() {
  const [tab, setTab] = useState<EditorTab>('landing');
  const [registry, setRegistry] = useState<PublicWebsiteEditorSite[]>([]);
  const [landing, setLanding] = useState<TenantLandingWebsiteContent | null>(null);
  const [menu, setMenu] = useState<TenantMenuWebsiteContent | null>(null);
  const [landingHostname, setLandingHostname] = useState('');
  const [menuHostname, setMenuHostname] = useState('');
  const [securityHostname, setSecurityHostname] = useState('');
  const [securityPublished, setSecurityPublished] = useState(false);
  const [securityPublishedAt, setSecurityPublishedAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const load = async () => {
    setIsLoading(true);
    const [editorResult, securityResult] = await Promise.all([
      fetchPublicWebsiteEditorData(),
      fetchSecuritySitePublishStatus(),
    ]);

    if (editorResult.success) {
      setRegistry(editorResult.registry);
      setLanding(editorResult.landing);
      setMenu(editorResult.menu);
      setLandingHostname(editorResult.landingHostname);
      setMenuHostname(editorResult.menuHostname);
      setLoadError(null);
    } else {
      setLoadError(editorResult.error ?? 'Failed to load');
    }

    if (securityResult.success) {
      setSecurityPublished(securityResult.isPublished);
      setSecurityPublishedAt(securityResult.publishedAt);
      setSecurityHostname(securityResult.hostname ?? '');
    }

    setIsLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const run = (task: () => Promise<{ success: boolean; error?: string }>, successText: string) => {
    startTransition(async () => {
      setActionMessage(null);
      const result = await task();
      if (!result.success) {
        setActionMessage(result.error ?? 'Action failed');
        return;
      }
      setActionMessage(successText);
      await load();
    });
  };

  if (isLoading) {
    return <p className="text-slate-500 animate-pulse text-sm">Loading public website settings…</p>;
  }

  if (loadError || !landing || !menu) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        {loadError ?? 'Failed to load settings'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard" className="text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-black text-slate-900 tracking-tight">Public website</h1>
        <p className="mt-2 text-sm text-slate-600 max-w-2xl">
          Draft and publish tenant marketing sites. Pair custom domains from Forge or partner setup,
          then set SSL to Active before going live.{' '}
          <Link href="/settings/superapp" className="font-semibold text-violet-700 hover:underline">
            Pears marketplace consent →
          </Link>
        </p>
      </div>

      {actionMessage ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {actionMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {registry.map((site) => (
          <button
            key={site.siteType}
            type="button"
            onClick={() => setTab(site.siteType)}
            className={`rounded-xl border p-4 text-left transition-colors ${
              tab === site.siteType
                ? 'border-violet-400 bg-violet-50'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{site.label}</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {site.isPublished ? 'Published' : 'Draft'}
            </p>
            <p className="mt-1 text-xs text-slate-500">{formatPublishedAt(site.publishedAt)}</p>
          </button>
        ))}
      </div>

      {tab === 'security_marketing' ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">
            Security marketing site
          </h2>
          <p className="text-sm text-slate-600">
            Edit the full security brochure at{' '}
            <Link href="/security-website" className="font-semibold text-violet-700 hover:underline">
              /security-website
            </Link>
            , then publish a snapshot here for anonymous visitors and custom domains.
          </p>
          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase text-slate-500">Public hostname (optional)</span>
            <input
              value={securityHostname}
              onChange={(e) => setSecurityHostname(e.target.value)}
              placeholder="classicventuresecurity.com"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
            />
          </label>
          <p className="text-xs text-slate-500">
            Status: {securityPublished ? `Published ${formatPublishedAt(securityPublishedAt)}` : 'Not published'}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                run(
                  () => publishSecurityMarketingWebsite(securityHostname),
                  'Security marketing site published.',
                )
              }
              className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-violet-500 disabled:opacity-50"
            >
              Publish snapshot
            </button>
            {securityPublished ? (
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  run(
                    () => unpublishTenantPublicWebsite('security_marketing'),
                    'Security site unpublished.',
                  )
                }
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Unpublish
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {tab === 'landing' ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">Landing page</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs font-bold uppercase text-slate-500">Hostname</span>
              <input
                value={landingHostname}
                onChange={(e) => setLandingHostname(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                placeholder="www.client.lk"
              />
            </label>
            {(
              [
                ['companyName', 'Company name'],
                ['tagline', 'Tagline'],
                ['heroHeadline', 'Hero headline'],
                ['heroSubheadline', 'Hero subheadline'],
                ['heroCtaLabel', 'CTA label'],
                ['heroCtaHref', 'CTA link'],
                ['aboutTitle', 'About title'],
                ['contactEmail', 'Contact email'],
                ['contactPhone', 'Contact phone'],
              ] as const
            ).map(([field, label]) => (
              <label key={field} className="space-y-1">
                <span className="text-xs font-bold uppercase text-slate-500">{label}</span>
                <input
                  value={landing[field]}
                  onChange={(e) => setLanding({ ...landing, [field]: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            ))}
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs font-bold uppercase text-slate-500">About body</span>
              <textarea
                value={landing.aboutBody}
                onChange={(e) => setLanding({ ...landing, aboutBody: e.target.value })}
                rows={4}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                run(
                  () => saveTenantLandingWebsiteDraft({ content: landing, hostname: landingHostname }),
                  'Landing draft saved.',
                )
              }
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Save draft
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                run(
                  () => publishTenantLandingWebsite({ content: landing, hostname: landingHostname }),
                  'Landing page published.',
                )
              }
              className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-violet-500 disabled:opacity-50"
            >
              Publish
            </button>
            <Link
              href="/public-website"
              className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-violet-700 hover:bg-violet-100"
            >
              Preview
            </Link>
          </div>
        </section>
      ) : null}

      {tab === 'menu' ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">Customer menu link</h2>
          <p className="text-sm text-slate-600">
            The menu itself runs on the client PWA. Publish a hostname reference and redirect target here.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs font-bold uppercase text-slate-500">Menu hostname</span>
              <input
                value={menuHostname}
                onChange={(e) => setMenuHostname(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                placeholder="tasha.lk"
              />
            </label>
            {(
              [
                ['title', 'Title'],
                ['tagline', 'Tagline'],
                ['menuUrl', 'Menu PWA URL'],
              ] as const
            ).map(([field, label]) => (
              <label key={field} className="space-y-1">
                <span className="text-xs font-bold uppercase text-slate-500">{label}</span>
                <input
                  value={menu[field]}
                  onChange={(e) => setMenu({ ...menu, [field]: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            ))}
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs font-bold uppercase text-slate-500">Notice</span>
              <textarea
                value={menu.notice}
                onChange={(e) => setMenu({ ...menu, notice: e.target.value })}
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                run(
                  () => saveTenantMenuWebsiteDraft({ content: menu, hostname: menuHostname }),
                  'Menu settings saved.',
                )
              }
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Save draft
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                run(
                  () => publishTenantMenuWebsite({ content: menu, hostname: menuHostname }),
                  'Menu link published.',
                )
              }
              className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-violet-500 disabled:opacity-50"
            >
              Publish
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
