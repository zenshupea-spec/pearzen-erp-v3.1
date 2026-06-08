'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import {
  normalizeTenantSlug,
  tenantProductionDomain,
  tenantProductionPortalUrl,
  tenantSubPortalLinks,
  type TenantSubPortalLink,
} from '../../lib/tenant-host';
import { CVS_TENANT_SLUG } from '../../lib/company-ids';
import { tenantBaseDomain } from '../../lib/tenant-host';
import { fetchAllTenants } from './actions';

const PORTAL_LINK_ACCENT: Record<string, string> = {
  executive: 'border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20',
  hq: 'border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20',
  om: 'border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20',
  tm: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20',
  sm: 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20',
  checkin: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20',
};

function TenantPortalLink({
  link,
  tenantSlug,
}: {
  link: TenantSubPortalLink;
  tenantSlug: string;
}) {
  const accent =
    PORTAL_LINK_ACCENT[link.id] ??
    'border-slate-600 bg-slate-800/50 text-slate-300 hover:bg-slate-700/50';
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
  const [expandedTenantId, setExpandedTenantId] = useState<string | null>(null);

  useEffect(() => {
    setAppOrigin(window.location.origin);
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
      const cvsTenant = uniqueBySlug.find(
        (row) => normalizeTenantSlug(row.slug) === CVS_TENANT_SLUG,
      );
      setTenants(cvsTenant ? [cvsTenant] : uniqueBySlug.slice(0, 1));
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0e] text-slate-200 font-sans pb-20">
      {/* Super Admin Header */}
      <div className="bg-[#111118] border-b border-indigo-500/20 sticky top-0 z-50 px-6 py-5 flex justify-between items-center shadow-lg shadow-black/40">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight uppercase flex items-center gap-3">
            <svg className="w-6 h-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            The SaaS Forge
          </h1>
          <p className="text-[10px] text-indigo-400 font-mono font-bold uppercase tracking-widest mt-1">
            Super Admin · {tenantBaseDomain()}
          </p>
        </div>
        <Link
          href="/forge/settings"
          className="text-xs font-bold text-indigo-400 hover:text-white uppercase tracking-wider"
        >
          Access control
        </Link>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        
        {/* Command Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link href="/forge/billing" className="group bg-[#111118] border border-slate-800 rounded-2xl p-6 transition-all hover:bg-rose-900/10 hover:border-rose-500/50">
            <div className="w-12 h-12 bg-rose-500/10 rounded-xl flex items-center justify-center mb-4 border border-rose-500/20 group-hover:scale-110 transition-transform">
              <svg className="w-6 h-6 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Platform Billing</h3>
            <p className="text-sm text-slate-400">Set database, frontend, and per-employee pricing. Generate monthly Pearzen.tech invoices for FM.</p>
          </Link>

          <Link href="/forge/settings" className="group bg-[#111118] border border-slate-800 rounded-2xl p-6 transition-all hover:bg-indigo-900/10 hover:border-indigo-500/50">
            <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center mb-4 border border-indigo-500/20 group-hover:scale-110 transition-transform">
              <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Access Control</h3>
            <p className="text-sm text-slate-400">Manage who can sign in to the SaaS Forge operator console.</p>
          </Link>
        </div>

        {/* Active Tenants Roster */}
        <div className="bg-[#111118] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="bg-slate-900/50 px-6 py-4 border-b border-slate-800 flex justify-between items-center">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Production Tenant</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-[#0a0a0e] text-slate-500 font-bold border-b border-slate-800 text-xs tracking-wider">
                <tr>
                  <th className="px-6 py-4">COMPANY NAME</th>
                  <th className="px-6 py-4">PRODUCTION DOMAIN</th>
                  <th className="px-6 py-4">PORTALS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {isLoading ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-12 text-center text-slate-500 font-mono animate-pulse">
                      Scanning for active instances...
                    </td>
                  </tr>
                ) : tenants.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-12 text-center text-slate-500 font-medium">
                      No production tenant registered yet.
                    </td>
                  </tr>
                ) : (
                  tenants.flatMap((tenant) => {
                    const displayCompany = tenant.name || tenant.company_name || tenant.trading_name || 'UNKNOWN TENANT';
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
                        className={`transition-colors ${isExpanded ? 'bg-slate-800/40' : 'hover:bg-slate-800/30'}`}
                      >
                        <td className="px-6 py-4">
                          <button
                            type="button"
                            disabled={!slug || !tenantId}
                            onClick={() =>
                              setExpandedTenantId(isExpanded ? null : tenantId)
                            }
                            className="group inline-flex max-w-full items-center gap-2 text-left font-bold text-white transition-colors hover:text-indigo-200 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <ChevronDown
                              className={`h-4 w-4 shrink-0 text-slate-500 transition-transform group-hover:text-indigo-300 ${
                                isExpanded ? 'rotate-180' : ''
                              }`}
                            />
                            <span className="truncate">{displayCompany}</span>
                          </button>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-slate-400">
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
                            className="text-xs font-bold text-indigo-400 hover:text-white uppercase tracking-wider disabled:opacity-50"
                          >
                            {isExpanded ? 'Hide portals' : 'Open portals'}
                          </button>
                        </td>
                      </tr>,
                    ];

                    if (isExpanded) {
                      rows.push(
                        <tr key={`${rowKey}-portals`} className="bg-[#0a0a0e]/80">
                          <td colSpan={3} className="px-6 py-4">
                            {portalLinks.length > 0 ? (
                              <div className="space-y-3">
                                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
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
                              <span className="text-xs text-slate-500">No slug — portal links unavailable</span>
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

      </div>
    </div>
  );
}
