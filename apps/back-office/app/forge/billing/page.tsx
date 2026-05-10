'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function BillingManager() {
  // Mock Tenant Billing State
  const [tenants, setTenants] = useState([
    { id: 'TNT-001', name: 'APEX SECURITY SOLUTIONS', status: 'ACTIVE', modules: ['CAFE_POS', 'ADVANCED_GEOFENCING'] },
    { id: 'TNT-002', name: 'TASHA CAFE 01', status: 'ACTIVE', modules: ['CAFE_POS'] },
    { id: 'TNT-003', name: 'SHALOM RESIDENCE', status: 'SUSPENDED', modules: [] }
  ]);

  const [processingId, setProcessingId] = useState<string | null>(null);

  const toggleKillSwitch = (tenantId: string, currentStatus: string) => {
    setProcessingId(tenantId);
    
    // Placeholder for Phase 8 DB Wiring (Toggle status in DB)
    setTimeout(() => {
      setTenants(tenants.map(t => 
        t.id === tenantId 
          ? { ...t, status: currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' } 
          : t
      ));
      setProcessingId(null);
    }, 1200);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-800 pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold uppercase tracking-widest text-red-500">
            Billing & Modules
          </h1>
          <p className="text-gray-500 text-sm uppercase tracking-wide mt-1">
            Kill-Switch & Feature Provisioning
          </p>
        </div>
        <Link href="/forge" className="bg-gray-900 border border-gray-700 px-4 py-2 rounded-lg text-sm uppercase font-bold hover:bg-gray-800 transition-colors text-white">
          Back
        </Link>
      </header>

      {/* Warning Banner */}
      <div className="bg-red-900/20 border border-red-500/50 p-4 rounded-xl flex items-start space-x-3">
        <span className="text-red-500 text-xl">⚠</span>
        <div>
          <p className="text-red-400 font-bold uppercase text-sm">Extreme Caution</p>
          <p className="text-gray-400 text-xs uppercase mt-1">Engaging a Kill-Switch will instantly lock all users (Guards, Admin, MD) out of the selected tenant's workspace and display a "Service Suspended" overlay.</p>
        </div>
      </div>

      {/* Tenant Ledger */}
      <section className="bg-gray-900/50 backdrop-blur-md border border-gray-800 p-6 rounded-2xl shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-gray-500 uppercase bg-gray-900 border-b border-gray-800">
              <tr>
                <th className="px-4 py-3">Tenant ID</th>
                <th className="px-4 py-3"ompany Name</th>
                <th className="px-4 py-3">Active Modules</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Kill-Switch</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={tenant.id} className={`border-b border-gray-800 transition-colors ${tenant.status === 'SUSPENDED' ? 'bg-red-900/10' : 'hover:bg-gray-800/50'}`}>
                  <td className="px-4 py-4 font-mono text-gray-400">{tenant.id}</td>
                  <td className="px-4 py-4 font-bold text-white uppercase">{tenant.name}</td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      {tenant.modules.length > 0 ? tenant.modules.map(mod => (
                        <span key={mod} className="bg-gray-800 text-gray-300 text-[10px] px-2 py-1 rounded border border-gray-700 uppercase font-mono tracking-wider">
                          {mod.replace('_', ' ')}
                        </span>
                      )) : <span className="text-gray-600 text-xs font-mono">CORE ONLY</span>}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest ${
                      tenant.status === 'ACTIVE' 
                      ? 'bg-green-900/30 text-green-500 border border-green-800' 
                      : 'bg-red-900/30 text-red-500 border border-red-800'
                    }`}>
                      {tenant.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <button 
                      onClick={() => toggleKillSwitch(tenant.id, tenant.status)}
                      disabled={processingId === tenant.id}
                      className={`px-4 py-2 rounded text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50 ${
                        tenant.status === 'ACTIVE'
                        ? 'bg-red-900/80 hover:bg-red-600 text-white border border-red-700'
                        : 'bg-green-900/80 hover:bg-green-600 text-white border border-green-700'
                      }`}
                    >
                      {processingId === tenant.id ? 'PROCESSING...' : tenant.status === 'ACTIVE' ? 'SUSPEND' : 'RESTORE'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
