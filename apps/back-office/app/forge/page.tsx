'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { tenantPortalLoginUrl, tenantProductionDomain, tenantProductionPortalUrl } from '../../lib/tenant-host';
import { fetchAllTenants } from './actions';

export default function SaaSForgeDashboard() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [appOrigin, setAppOrigin] = useState('');

  useEffect(() => {
    setAppOrigin(window.location.origin);
    loadTenants();
  }, []);

  const loadTenants = async () => {
    setIsLoading(true);
    const result = await fetchAllTenants();
    if (result.success) {
      setTenants(result.data);
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
            Super Admin Access Only
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link href="/forge/companies/new" className="group bg-[#111118] border border-slate-800 rounded-2xl p-6 transition-all hover:bg-indigo-900/10 hover:border-indigo-500/50">
            <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center mb-4 border border-indigo-500/20 group-hover:scale-110 transition-transform">
              <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Onboard New Tenant</h3>
            <p className="text-sm text-slate-400">Deploy a new isolated company instance, setup white-labeling, and seed admin accounts.</p>
          </Link>

          <Link href="/forge/billing" className="group bg-[#111118] border border-slate-800 rounded-2xl p-6 transition-all hover:bg-rose-900/10 hover:border-rose-500/50">
            <div className="w-12 h-12 bg-rose-500/10 rounded-xl flex items-center justify-center mb-4 border border-rose-500/20 group-hover:scale-110 transition-transform">
              <svg className="w-6 h-6 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Billing & Kill-Switch</h3>
            <p className="text-sm text-slate-400">Manage client subscriptions and toggle the system-wide lockout for unpaid invoices.</p>
          </Link>

          <Link href="/forge/modules" className="group bg-[#111118] border border-slate-800 rounded-2xl p-6 transition-all hover:bg-emerald-900/10 hover:border-emerald-500/50">
            <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center mb-4 border border-emerald-500/20 group-hover:scale-110 transition-transform">
              <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Module Provisioning</h3>
            <p className="text-sm text-slate-400">Enable or disable Optional Modules (like Tasha Cafe Hospitality) per tenant.</p>
          </Link>
        </div>

        {/* Active Tenants Roster */}
        <div className="bg-[#111118] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="bg-slate-900/50 px-6 py-4 border-b border-slate-800 flex justify-between items-center">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Active Client Tenants</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-[#0a0a0e] text-slate-500 font-bold border-b border-slate-800 text-xs tracking-wider">
                <tr>
                  <th className="px-6 py-4">COMPANY NAME</th>
                  <th className="px-6 py-4">PORTAL LOGIN</th>
                  <th className="px-6 py-4">PRODUCTION DOMAIN</th>
                  <th className="px-6 py-4">BILLING STATUS</th>
                  <th className="px-6 py-4 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-500 font-mono animate-pulse">
                      Scanning for active instances...
                    </td>
                  </tr>
                ) : tenants.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-500 font-medium">
                      No client companies registered yet.
                    </td>
                  </tr>
                ) : (
                  tenants.map((tenant) => {
                    const displayCompany = tenant.name || tenant.company_name || tenant.trading_name || 'UNKNOWN TENANT';
                    const portalLoginUrl = tenantPortalLoginUrl(tenant.slug, appOrigin || undefined);
                    const productionUrl = tenantProductionPortalUrl(tenant.slug);
                    const productionDomain = tenantProductionDomain(tenant.slug);

                    return (
                      <tr key={tenant.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-4 font-bold text-white">
                          {displayCompany}
                        </td>
                        <td className="px-6 py-4">
                          {portalLoginUrl ? (
                            <a
                              href={portalLoginUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-xs text-indigo-400 hover:text-indigo-200 underline-offset-2 hover:underline"
                            >
                              Open portal login
                            </a>
                          ) : (
                            <span className="text-slate-500">No slug</span>
                          )}
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-slate-400">
                          {productionDomain ? (
                            <span title={productionUrl ?? undefined}>{productionDomain}</span>
                          ) : (
                            'N/A'
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider ${tenant.is_suspended ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                            {tenant.is_suspended ? 'LOCKED OUT' : 'ACTIVE'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button className="text-xs font-bold text-indigo-400 hover:text-white uppercase tracking-wider">Manage</button>
                        </td>
                      </tr>
                    );
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
