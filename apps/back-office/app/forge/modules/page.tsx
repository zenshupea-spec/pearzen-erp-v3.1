'use client';

import React, { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchModuleTenants, toggleTenantModule } from './actions';

export default function ModuleProvisioningPage() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    router.replace('/forge');
  }, [router]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    const result = await fetchModuleTenants();
    if (result.success) {
      setTenants(result.data);
    }
    setIsLoading(false);
  };

  const handleToggleModule = (id: string, currentStatus: boolean) => {
    startTransition(async () => {
      const result = await toggleTenantModule(id, currentStatus);
      if (result.success) {
        await loadData(); // Update local state
        router.refresh(); // Hard refresh Next.js cache
      } else {
        alert("Failed to toggle module. Check console.");
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0e] text-slate-200 font-sans pb-20">
      {/* Header */}
      <div className="bg-[#111118] border-b border-emerald-500/20 sticky top-0 z-50 px-6 py-4 flex items-center gap-4 shadow-lg">
        <Link href="/forge" className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-black text-white tracking-tight uppercase">Module Provisioning</h1>
          <p className="text-[10px] text-emerald-400 font-mono font-bold uppercase tracking-widest mt-0.5">
            Feature Flag Controls
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="bg-[#111118] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-[#0a0a0e] text-slate-500 font-bold border-b border-slate-800 text-xs tracking-wider">
                <tr>
                  <th className="px-6 py-4">COMPANY NAME</th>
                  <th className="px-6 py-4">HOSPITALITY MODULE (CAFE)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {isLoading ? (
                  <tr>
                    <td colSpan={2} className="px-6 py-12 text-center text-slate-500 font-mono animate-pulse">
                      Loading tenant modules...
                    </td>
                  </tr>
                ) : tenants.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-6 py-12 text-center text-slate-500 font-medium">
                      No tenants found.
                    </td>
                  </tr>
                ) : (
                  tenants.map((tenant) => {
                    const displayCompany = tenant.name || tenant.company_name || tenant.trading_name || 'UNKNOWN TENANT';
                    const hasCafe = !!tenant.has_cafe_module;

                    return (
                      <tr key={tenant.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-4 font-bold text-white">
                          {displayCompany}
                        </td>
                        <td className="px-6 py-4">
                          <button 
                            onClick={() => handleToggleModule(tenant.id, hasCafe)}
                            disabled={isPending}
                            className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors disabled:opacity-50 ${hasCafe ? 'bg-emerald-500' : 'bg-slate-700'}`}
                          >
                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${hasCafe ? 'translate-x-8' : 'translate-x-1'}`} />
                          </button>
                          <span className={`ml-3 text-xs font-bold tracking-wider uppercase ${hasCafe ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {hasCafe ? 'ENABLED' : 'DISABLED'}
                          </span>
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
