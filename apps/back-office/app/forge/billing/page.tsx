'use client';

import React, { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchBillingTenants, toggleKillSwitch } from './actions';

export default function BillingKillSwitchPage() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    const result = await fetchBillingTenants();
    if (result.success) {
      setTenants(result.data);
    }
    setIsLoading(false);
  };

  const handleToggleSuspend = (id: string, currentStatus: boolean) => {
    const actionText = currentStatus ? "REACTIVATE" : "SUSPEND";
    if (!window.confirm(`Are you sure you want to ${actionText} this tenant? This applies globally immediately.`)) return;

    startTransition(async () => {
      const result = await toggleKillSwitch(id, currentStatus);
      if (result.success) {
        await loadData();
        router.refresh(); // Hard refresh Next.js cache to show the new state
      } else {
        alert("Failed to toggle suspension. Check your terminal running the dev server for the exact Supabase error.");
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0e] text-slate-200 font-sans pb-20">
      {/* Header */}
      <div className="bg-[#111118] border-b border-rose-500/20 sticky top-0 z-50 px-6 py-4 flex items-center gap-4 shadow-lg">
        <Link href="/forge" className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-black text-white tracking-tight uppercase">Billing & Kill-Switch</h1>
          <p className="text-[10px] text-rose-400 font-mono font-bold uppercase tracking-widest mt-0.5">
            Global Lockout Controls
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        
        {/* Warning Banner */}
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex items-start gap-3 mb-8">
          <svg className="w-6 h-6 text-rose-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <h3 className="text-sm font-bold text-rose-400 uppercase tracking-wide">Danger Zone</h3>
            <p className="text-xs text-rose-400/80 mt-1">
              Engaging the Kill-Switch will instantly revoke all access for the tenant's Head Office, Guards, and Clients. They will see a "Service Suspended for Unpaid Invoice" screen.
            </p>
          </div>
        </div>

        {/* Tenants Table */}
        <div className="bg-[#111118] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-[#0a0a0e] text-slate-500 font-bold border-b border-slate-800 text-xs tracking-wider">
                <tr>
                  <th className="px-6 py-4">TENANT ID</th>
                  <th className="px-6 py-4">COMPANY NAME</th>
                  <th className="px-6 py-4">STATUS</th>
                  <th className="px-6 py-4 text-right">KILL-SWITCH</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-500 font-mono animate-pulse">
                      Loading financial states...
                    </td>
                  </tr>
                ) : tenants.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-500 font-medium">
                      No tenants found.
                    </td>
                  </tr>
                ) : (
                  tenants.map((tenant) => {
                    const companyName = tenant.name || tenant.company_name || tenant.trading_name || 'UNKNOWN TENANT';
                    const shortId = tenant.id ? tenant.id.substring(0, 8).toUpperCase() : 'N/A';
                    const isSuspended = !!tenant.is_suspended;

                    return (
                      <tr key={tenant.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-4 font-mono text-xs text-slate-400">
                          {shortId}
                        </td>
                        <td className="px-6 py-4 font-bold text-white">
                          {companyName}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider ${isSuspended ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                            {isSuspended ? 'SUSPENDED' : 'ACTIVE'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => handleToggleSuspend(tenant.id, isSuspended)}
                            disabled={isPending}
                            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 ${isSuspended ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-rose-600/20 text-rose-400 hover:bg-rose-600 hover:text-white border border-rose-500/30'}`}
                          >
                            {isPending ? 'WAIT...' : (isSuspended ? 'REACTIVATE' : 'SUSPEND')}
                          </button>
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
