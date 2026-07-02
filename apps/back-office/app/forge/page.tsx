'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import {
  normalizeTenantSlug,
  tenantProductionDomain,
  tenantProductionPortalUrl,
  tenantSubPortalLinks,
  tenantBaseDomain,
  isLocalDevHost,
  type TenantSubPortalLink,
} from '../../lib/tenant-host';
import { fetchAllTenants } from './actions';
import {
  FORGE_CARD_ACCENTS,
  FORGE_PORTAL_THEME as T,
  type ForgeCardAccent,
} from './components/forge-portal-theme';
import ForgeClientHubHero from './components/ForgeClientHubHero';
import ForgeMarketingCard from './components/ForgeMarketingCard';
import ForgePartnersHubCard from './components/ForgePartnersHubCard';
import ForgePearsAppCard from './components/ForgePearsAppCard';
import ForgeTemplatesCard from './components/ForgeTemplatesCard';

const PORTAL_LINK_ACCENT: Record<string, string> = {
  executive: 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100',
  hq: 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
  om: 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100',
  tm: 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
  sm: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
  checkin: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
};

type CardAccent = ForgeCardAccent;

type ForgeNavCard = {
  href: string;
  title: string;
  description: string;
  accent: CardAccent;
  icon: React.ReactNode;
  badge?: string;
};

const CARD_STYLES = FORGE_CARD_ACCENTS;

const PLATFORM_CARDS: ForgeNavCard[] = [
  {
    href: '/forge/billing',
    title: 'ERP Subscription Billing',
    description:
      'Per-tenant database, frontend, and per-employee pricing. Monthly platform invoices surfaced in FM.',
    accent: 'rose',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"
      />
    ),
  },
  {
    href: '/forge/health',
    title: 'Platform Health',
    description:
      'Cross-tenant metrics, subscription status, and partner performance dashboards.',
    accent: 'sky',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
      />
    ),
  },
  {
    href: '/forge/settings/pricing',
    title: 'Client Pricing',
    description:
      'Website manager splits, WFM per-employee rates, and custom software milestone packages — no code changes.',
    accent: 'emerald',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"
      />
    ),
  },
  {
    href: '/forge/settings',
    title: 'Access Control',
    description: 'Manage who can sign in to the SaaS Forge operator console.',
    accent: 'indigo',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
      />
    ),
  },
  {
    href: '/forge/partners/payouts',
    title: 'Partner Payout Audit',
    description:
      'Cross-partner revenue-share ledger from paid ERP and commerce invoices.',
    accent: 'cyan',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
      />
    ),
  },
  {
    href: '/forge/partners/assist',
    title: 'Partner Assist Grants',
    description:
      'Toggle domain and PayHere setup assist for service partners per linked tenant.',
    accent: 'violet',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
    ),
  },
];

const COMMERCE_CARDS: ForgeNavCard[] = [
  {
    href: '/forge/commerce/catalog',
    title: 'Product Catalog',
    description:
      'WFM tool, custom internal software, website building, and vertical add-ons — each a separate product line.',
    accent: 'amber',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
      />
    ),
  },
  {
    href: '/forge/commerce/pricing',
    title: 'Product Pricing',
    description: 'List prices and billing models for standalone purchases — not ERP seat rates.',
    accent: 'amber',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"
      />
    ),
  },
  {
    href: '/forge/commerce/purchases',
    title: 'Purchases',
    description:
      'Track WFM buys, custom software engagements, and website projects separately from tenant ERP billing.',
    accent: 'amber',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
      />
    ),
  },
  {
    href: '/forge/commerce/invoices',
    title: 'Product Invoices',
    description: 'Auto-send purchase invoices via Resend. Distinct from monthly ERP platform invoices.',
    accent: 'amber',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    ),
  },
];

const MARKETING_CARDS: ForgeNavCard[] = [
  {
    href: '/forge/inbox',
    title: 'Contact Inbox',
    description:
      'Read and reply to info@pearzen.tech inquiries — WFM, custom software, and website leads.',
    accent: 'cyan',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    ),
  },
];

const TENANT_CARDS: ForgeNavCard[] = [
  {
    href: '/forge/tenants',
    title: 'Tenant Roster',
    description: 'Subscription status, billing sync, and kill-switch flags for every ERP tenant.',
    accent: 'violet',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 6h16M4 10h16M4 14h16M4 18h16"
      />
    ),
  },
  {
    href: '/forge/companies/new',
    title: 'Onboard Tenant',
    description: 'Deploy a new company — slug, MD/OD seeds, and default settings in Supabase.',
    accent: 'violet',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    ),
  },
  {
    href: '/forge/modules',
    title: 'Module Provisioning',
    description: 'Toggle vertical modules per tenant — café/hospitality and future salon/retail flags.',
    accent: 'violet',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
    ),
  },
];

function ForgeNavCardLink({ card }: { card: ForgeNavCard }) {
  const styles = CARD_STYLES[card.accent];

  return (
    <Link
      href={card.href}
      className={`group relative ${T.card} p-6 ${T.cardHover} ${styles.hover}`}
    >
      {card.badge ? (
        <span className="absolute top-4 right-4 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700">
          {card.badge}
        </span>
      ) : null}
      <div
        className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl border ${styles.iconBg} ${styles.iconBorder} transition-transform group-hover:scale-110`}
      >
        <svg
          className={`h-6 w-6 ${styles.iconText}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          {card.icon}
        </svg>
      </div>
      <h3 className="mb-1 pr-12 text-lg font-bold text-slate-900">{card.title}</h3>
      <p className="text-sm text-slate-500">{card.description}</p>
    </Link>
  );
}

function ForgeDashboardSection({
  title,
  description,
  children,
  id,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="space-y-4">
      <div>
        <h2 className={T.sectionLabel}>{title}</h2>
        <p className={T.sectionDesc}>{description}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">{children}</div>
    </section>
  );
}

function TenantPortalLink({
  link,
  tenantSlug,
}: {
  link: TenantSubPortalLink;
  tenantSlug: string;
}) {
  const accent =
    PORTAL_LINK_ACCENT[link.id] ??
    'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100';
  const className = `inline-flex items-center rounded-lg border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${accent}`;
  const windowName = `pearzen-portal-${tenantSlug}-${link.id}`;

  const openPortal = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(link.href, windowName, 'noopener,noreferrer');
  };

  return (
    <a
      href={link.href}
      className={className}
      onClick={openPortal}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {link.label}
    </a>
  );
}

export default function SaaSForgeDashboard() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [appOrigin, setAppOrigin] = useState('');
  const [envSubtitle, setEnvSubtitle] = useState(`Super Admin · ${tenantBaseDomain()}`);
  const [expandedTenantId, setExpandedTenantId] = useState<string | null>(null);

  useEffect(() => {
    const { hostname, host } = window.location;
    setAppOrigin(window.location.origin);
    if (isLocalDevHost(hostname)) {
      setEnvSubtitle(`Local dev · ${host}`);
    } else {
      setEnvSubtitle(`Super Admin · ${tenantBaseDomain()}`);
    }
    loadTenants();
  }, []);

  const loadTenants = async () => {
    setIsLoading(true);
    const result = await fetchAllTenants();
    if (result.success) {
      const rows = result.data ?? [];
      const uniqueById = Array.from(
        new Map(rows.filter((row) => row?.id).map((row) => [String(row.id), row])).values(),
      );
      const uniqueBySlug = Array.from(
        uniqueById
          .reduce((map, row) => {
            const slug = normalizeTenantSlug(row.slug);
            if (slug && !map.has(slug)) map.set(slug, row);
            return map;
          }, new Map<string, (typeof uniqueById)[number]>())
          .values(),
      );
      setTenants(uniqueBySlug);
    }
    setIsLoading(false);
  };

  return (
    <div className="space-y-12">
      <div className="rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50 to-white px-6 py-5 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Pearzen.tech Overwatch</h1>
        <p className={`mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${T.accent}`}>
          {envSubtitle}
        </p>
        <p className="mt-3 max-w-2xl text-sm text-slate-500">
          Operator console for web managers, website clients, WFM subscribers, custom software, PEARS
          marketplace, and pearzen.tech marketing.
        </p>
      </div>

      <ForgeClientHubHero />

      <section id="overwatch" className="space-y-4">
        <div>
          <h2 className={T.sectionLabel}>Platform overwatch</h2>
          <p className={T.sectionDesc}>
            Marketing site, PEARS super-app, website templates, and partner performance.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ForgeMarketingCard />
          <ForgePearsAppCard />
          <ForgeTemplatesCard />
          <ForgePartnersHubCard />
        </div>
      </section>

      <ForgeDashboardSection
          id="operations"
          title="Platform operations"
          description="ERP billing, health monitoring, client pricing, partner payout audit, and operator access."
        >
          {PLATFORM_CARDS.map((card) => (
            <ForgeNavCardLink key={card.href} card={card} />
          ))}
        </ForgeDashboardSection>

        <ForgeDashboardSection
          id="commerce"
          title="Commerce"
          description="Standalone product sales — WFM, custom software, and website building — tracked separately from ERP subscriptions."
        >
          {COMMERCE_CARDS.map((card) => (
            <ForgeNavCardLink key={card.href} card={card} />
          ))}
        </ForgeDashboardSection>

        <ForgeDashboardSection
          id="inbox"
          title="Inbound leads"
          description="Pearzen.tech contact form inquiries."
        >
          {MARKETING_CARDS.map((card) => (
            <ForgeNavCardLink key={card.href} card={card} />
          ))}
        </ForgeDashboardSection>

        <section id="tenants" className="space-y-4">
          <div>
            <h2 className={T.sectionLabel}>Tenants</h2>
            <p className={T.sectionDesc}>
              Production ERP instances, onboarding, and per-tenant module flags.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {TENANT_CARDS.map((card) => (
              <ForgeNavCardLink key={card.href} card={card} />
            ))}
          </div>

          <div className={T.tableWrap}>
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
              <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500">
                Production Tenant
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full whitespace-nowrap text-left text-sm">
                <thead className={`${T.tableHead}`}>
                  <tr>
                    <th className="px-6 py-4">COMPANY NAME</th>
                    <th className="px-6 py-4">PRODUCTION DOMAIN</th>
                    <th className="px-6 py-4">PORTALS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr>
                      <td colSpan={3} className="animate-pulse px-6 py-12 text-center font-mono text-slate-400">
                        Scanning for active instances...
                      </td>
                    </tr>
                  ) : tenants.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-12 text-center font-medium text-slate-400">
                        No production tenant registered yet.
                      </td>
                    </tr>
                  ) : (
                    tenants.flatMap((tenant) => {
                      const displayCompany =
                        tenant.name ||
                        tenant.company_name ||
                        tenant.trading_name ||
                        'UNKNOWN TENANT';
                      const tenantId = tenant?.id != null ? String(tenant.id) : null;
                      const slug = normalizeTenantSlug(tenant.slug);
                      const productionUrl = tenantProductionPortalUrl(slug);
                      const productionDomain = tenantProductionDomain(slug);
                      const portalLinks = tenantSubPortalLinks(slug, appOrigin || undefined);
                      const isExpanded =
                        tenantId !== null && expandedTenantId === tenantId;
                      const rowKey = tenantId ?? slug ?? displayCompany;

                      const rows = [
                        <tr
                          key={rowKey}
                          className={`${isExpanded ? T.tableRowActive : T.tableRow}`}
                        >
                          <td className="px-6 py-4">
                            <button
                              type="button"
                              disabled={!slug || !tenantId}
                              onClick={() =>
                                setExpandedTenantId(isExpanded ? null : tenantId)
                              }
                              className="group inline-flex max-w-full items-center gap-2 text-left font-bold text-slate-800 transition-colors hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <ChevronDown
                                className={`h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:text-violet-500 ${
                                  isExpanded ? 'rotate-180' : ''
                                }`}
                              />
                              <span className="truncate">{displayCompany}</span>
                            </button>
                          </td>
                          <td className="px-6 py-4 font-mono text-xs text-slate-500">
                            {productionDomain ? (
                              <span title={productionUrl ?? undefined}>{productionDomain}</span>
                            ) : (
                              'N/A'
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <button
                              type="button"
                              disabled={!slug || !tenantId}
                              onClick={() =>
                                setExpandedTenantId(isExpanded ? null : tenantId)
                              }
                              className="text-xs font-bold uppercase tracking-wider text-violet-600 hover:text-violet-800 disabled:opacity-50"
                            >
                              {isExpanded ? 'Hide portals' : 'Open portals'}
                            </button>
                          </td>
                        </tr>,
                      ];

                      if (isExpanded) {
                        rows.push(
                          <tr key={`${rowKey}-portals`} className="bg-slate-50/80">
                            <td colSpan={3} className="px-6 py-4">
                              {portalLinks.length > 0 ? (
                                <div className="space-y-3">
                                  <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400">
                                    Sub portals
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {portalLinks.map((link) => (
                                      <TenantPortalLink
                                        key={link.id}
                                        link={link}
                                        tenantSlug={slug}
                                      />
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400">
                                  No slug — portal links unavailable
                                </span>
                              )}
                            </td>
                          </tr>,
                        );
                      }

                      return rows;
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
    </div>
  );
}
