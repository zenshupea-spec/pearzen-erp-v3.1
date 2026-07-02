'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import {
  FORGE_WEBSITE_TEMPLATE_VERTICALS,
  forgeWebsiteTemplateVerticalLabel,
  type ForgeWebsiteTemplateRecord,
} from '../../../../lib/forge-website-templates';
import {
  mergeTenantLandingContent,
  mergeTenantMenuContent,
  tenantPublicSiteTypeLabel,
  type TenantLandingWebsiteContent,
  type TenantMenuWebsiteContent,
} from '../../../../lib/tenant-public-site-types';
import { FORGE_PORTAL_THEME as T } from '../../components/forge-portal-theme';
import {
  fetchForgeWebsiteTemplateBySlug,
  updateForgeWebsiteTemplate,
  type UpdateForgeWebsiteTemplateInput,
} from '../actions';

type SecurityStarterFields = {
  companyName: string;
  tagline: string;
  heroHeadline: string;
  heroSubheadline: string;
  heroCtaPrimary: string;
  heroCtaSecondary: string;
};

function mergeSecurityStarterFields(raw: Record<string, unknown>): SecurityStarterFields {
  return {
    companyName: typeof raw.companyName === 'string' ? raw.companyName : '',
    tagline: typeof raw.tagline === 'string' ? raw.tagline : '',
    heroHeadline: typeof raw.heroHeadline === 'string' ? raw.heroHeadline : '',
    heroSubheadline: typeof raw.heroSubheadline === 'string' ? raw.heroSubheadline : '',
    heroCtaPrimary: typeof raw.heroCtaPrimary === 'string' ? raw.heroCtaPrimary : '',
    heroCtaSecondary: typeof raw.heroCtaSecondary === 'string' ? raw.heroCtaSecondary : '',
  };
}

function fieldClassName() {
  return 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900';
}

function labelClassName() {
  return 'text-xs font-bold uppercase tracking-wider text-slate-500';
}

function TemplateContentEditor({
  siteType,
  landing,
  setLanding,
  menu,
  setMenu,
  security,
  setSecurity,
}: {
  siteType: ForgeWebsiteTemplateRecord['siteType'];
  landing: TenantLandingWebsiteContent;
  setLanding: (value: TenantLandingWebsiteContent) => void;
  menu: TenantMenuWebsiteContent;
  setMenu: (value: TenantMenuWebsiteContent) => void;
  security: SecurityStarterFields;
  setSecurity: (value: SecurityStarterFields) => void;
}) {
  if (siteType === 'landing') {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
            <span className={labelClassName()}>{label}</span>
            <input
              value={landing[field]}
              onChange={(e) => setLanding({ ...landing, [field]: e.target.value })}
              className={fieldClassName()}
            />
          </label>
        ))}
        <label className="space-y-1 md:col-span-2">
          <span className={labelClassName()}>About body</span>
          <textarea
            value={landing.aboutBody}
            onChange={(e) => setLanding({ ...landing, aboutBody: e.target.value })}
            rows={4}
            className={fieldClassName()}
          />
        </label>
      </div>
    );
  }

  if (siteType === 'menu') {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {(
          [
            ['title', 'Title'],
            ['tagline', 'Tagline'],
            ['menuUrl', 'Menu PWA URL'],
          ] as const
        ).map(([field, label]) => (
          <label key={field} className="space-y-1">
            <span className={labelClassName()}>{label}</span>
            <input
              value={menu[field]}
              onChange={(e) => setMenu({ ...menu, [field]: e.target.value })}
              className={fieldClassName()}
            />
          </label>
        ))}
        <label className="space-y-1 md:col-span-2">
          <span className={labelClassName()}>Notice</span>
          <textarea
            value={menu.notice}
            onChange={(e) => setMenu({ ...menu, notice: e.target.value })}
            rows={3}
            className={fieldClassName()}
          />
        </label>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Starter hero copy for the security marketing brochure. Full sections merge with platform
        defaults when a manager launches this template.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {(
          [
            ['companyName', 'Company name'],
            ['tagline', 'Tagline'],
            ['heroHeadline', 'Hero headline'],
            ['heroSubheadline', 'Hero subheadline'],
            ['heroCtaPrimary', 'Primary CTA'],
            ['heroCtaSecondary', 'Secondary CTA'],
          ] as const
        ).map(([field, label]) => (
          <label key={field} className="space-y-1">
            <span className={labelClassName()}>{label}</span>
            <input
              value={security[field]}
              onChange={(e) => setSecurity({ ...security, [field]: e.target.value })}
              className={fieldClassName()}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

export default function ForgeTemplateEditorPage() {
  const params = useParams();
  const slug = typeof params.slug === 'string' ? params.slug : '';

  const [template, setTemplate] = useState<ForgeWebsiteTemplateRecord | null>(null);
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');
  const [vertical, setVertical] = useState('general');
  const [previewImageUrl, setPreviewImageUrl] = useState('');
  const [sortOrder, setSortOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);
  const [landing, setLanding] = useState<TenantLandingWebsiteContent | null>(null);
  const [menu, setMenu] = useState<TenantMenuWebsiteContent | null>(null);
  const [security, setSecurity] = useState<SecurityStarterFields | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionTone, setActionTone] = useState<'success' | 'error'>('success');
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const load = async () => {
    if (!slug) {
      setLoadError('Missing template slug');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const result = await fetchForgeWebsiteTemplateBySlug(slug);
    if (!result.success || !result.template) {
      setLoadError(result.error ?? 'Template not found');
      setTemplate(null);
      setIsLoading(false);
      return;
    }

    const row = result.template;
    setTemplate(row);
    setName(row.name);
    setTagline(row.tagline ?? '');
    setDescription(row.description ?? '');
    setVertical(row.vertical);
    setPreviewImageUrl(row.previewImageUrl ?? '');
    setSortOrder(row.sortOrder);
    setIsActive(row.isActive);
    setIsFeatured(row.isFeatured);
    setLanding(mergeTenantLandingContent(row.contentJson));
    setMenu(mergeTenantMenuContent(row.contentJson));
    setSecurity(mergeSecurityStarterFields(row.contentJson));
    setLoadError(null);
    setIsLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const buildContentJson = (): Record<string, unknown> => {
    if (!template) return {};
    if (template.siteType === 'landing' && landing) {
      return { ...landing };
    }
    if (template.siteType === 'menu' && menu) {
      return { ...menu };
    }
    if (template.siteType === 'security_marketing' && security) {
      return { ...template.contentJson, ...security };
    }
    return template.contentJson;
  };

  const handleSave = () => {
    if (!template) return;

    const payload: UpdateForgeWebsiteTemplateInput = {
      slug: template.slug,
      name,
      tagline: tagline.trim() || null,
      description: description.trim() || null,
      vertical,
      contentJson: buildContentJson(),
      previewImageUrl: previewImageUrl.trim() || null,
      sortOrder,
      isActive,
      isFeatured,
    };

    startTransition(async () => {
      setActionMessage(null);
      const result = await updateForgeWebsiteTemplate(payload);
      if (!result.success) {
        setActionTone('error');
        setActionMessage(result.error ?? 'Save failed');
        return;
      }
      setActionTone('success');
      setActionMessage('Template saved.');
      if (result.template) {
        setTemplate(result.template);
      }
    });
  };

  if (isLoading) {
    return <p className="text-sm text-slate-500 animate-pulse">Loading template…</p>;
  }

  if (loadError || !template || !landing || !menu || !security) {
    return (
      <div className="space-y-4">
        <Link
          href="/forge/templates"
          className="text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-violet-700"
        >
          ← Template gallery
        </Link>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {loadError ?? 'Template not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/forge/templates"
          className="text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-violet-700"
        >
          ← Template gallery
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{template.name}</h1>
        <p className={`mt-1 ${T.sectionDesc}`}>
          {tenantPublicSiteTypeLabel(template.siteType)} · slug{' '}
          <span className="font-mono text-xs">{template.slug}</span>
        </p>
      </div>

      {actionMessage ? (
        <div
          className={`rounded-xl border p-4 text-sm ${
            actionTone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {actionMessage}
        </div>
      ) : null}

      <section className={`${T.card} space-y-4 p-6`}>
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">Gallery metadata</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="space-y-1 md:col-span-2">
            <span className={labelClassName()}>Display name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={fieldClassName()} />
          </label>
          <label className="space-y-1">
            <span className={labelClassName()}>Tagline</span>
            <input value={tagline} onChange={(e) => setTagline(e.target.value)} className={fieldClassName()} />
          </label>
          <label className="space-y-1">
            <span className={labelClassName()}>Vertical</span>
            <select
              value={vertical}
              onChange={(e) => setVertical(e.target.value)}
              className={fieldClassName()}
            >
              {FORGE_WEBSITE_TEMPLATE_VERTICALS.map((value) => (
                <option key={value} value={value}>
                  {forgeWebsiteTemplateVerticalLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className={labelClassName()}>Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={fieldClassName()}
            />
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className={labelClassName()}>Preview image URL</span>
            <input
              value={previewImageUrl}
              onChange={(e) => setPreviewImageUrl(e.target.value)}
              placeholder="https://…"
              className={`${fieldClassName()} font-mono`}
            />
          </label>
          <label className="space-y-1">
            <span className={labelClassName()}>Sort order</span>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              className={fieldClassName()}
            />
          </label>
          <div className="flex flex-wrap items-center gap-4 pt-6">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-slate-300"
              />
              Active in gallery
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={isFeatured}
                onChange={(e) => setIsFeatured(e.target.checked)}
                className="rounded border-slate-300"
              />
              Featured
            </label>
          </div>
        </div>
      </section>

      <section className={`${T.card} space-y-4 p-6`}>
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">Starter site copy</h2>
        <TemplateContentEditor
          siteType={template.siteType}
          landing={landing}
          setLanding={setLanding}
          menu={menu}
          setMenu={setMenu}
          security={security}
          setSecurity={setSecurity}
        />
      </section>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={handleSave}
          className="rounded-full border border-violet-300 bg-violet-600 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
        >
          Save template
        </button>
        <Link
          href="/forge/templates"
          className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-600 hover:border-slate-300"
        >
          Back to gallery
        </Link>
      </div>
    </div>
  );
}
