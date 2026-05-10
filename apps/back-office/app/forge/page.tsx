'use client';

import Link from 'next/link';

export default function ForgeDashboard() {
  // Mock Tenant Data
  const tenants = [
    { id: 'TNT-001', name: 'APEX SECURITY SOLUTIONS', status: 'ACTIVE', users: 142 },
    { id: 'TNT-002', name: 'TASHA CAFE 01', status: 'ACTIVE', users: 18 },
    { id: 'TNT-003', name: 'SHALOM RESIDENCE', status: 'SUSPENDED', users: 5 }
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-800 pb-4">
        <div>
          <h1 className="text-2xl md:text-4xl font-bold uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-rgray-100 to-gray-500">
            The SaaS Forge
          </h1>
          <p className="text-gray-500 text-sm uppercase tracking-wide mt-1">
            Global Tenant & Infrastructure Control
          </p>
        </div>
      </header>

      {/* Global Metrics */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-900/80 border border-gray-700 p-5 rounded-xl shadow-lg">
          <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Total Tenants</p>
          <p className="text-2xl font-mono mt-2 text-white">3</p>
        </div>
        <div className="bg-gray-900/80 border border-gray-700 p-5 rounded-xl shadow-lg">
          <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Active Guards</p>
          <p className="text-2xl font-mono mt-2 text-green-400">142</p>
        </div>
        <div className="bg-gray-900/80 border border-gray-700 p-5 rounded-xl shadow-lg">
          <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Suspended Clients</p>
          <p className="text-2xl font-mono mt-2 text-red-500">1</p>
        </div>
        <div className="bg-gray-900/80 border border-gray-700 p-5 rounded-xl shadow-lg">
          <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">System Health</p>
          <p className="text-2xl font-mono mt-2 text-green-500 animate-pulse">OPTIMAL</p>
        </div>
      </section>

      {/* Navigation Gateway */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/forge/tenants/new" className="block">
          <div className="group bg-gradient-to-br from-gray-900 to-black border border-gray-700 hover:border-white p-6 rounded-2xl transition-all duration-300">
            <h2 className="text-xl font-bold uppercase tracking-wide group-hover:text-white text-gray-300 transition-colors">🏢 Provision New Tenant</h2>
            <p className="text-sm text-gray-500 mt-2">Initialize database isolation, generate compa_id, and upload white-label assets.</p>
          </div>
        </Link>

        <Link href="/forge/billing" className="block">
          <div className="group bg-gradient-to-br from-gray-900 to-black border border-gray-700 hover:border-red-500 p-6 rounded-2xl transition-all duration-300">
            <h2 className="text-xl font-bold uppercase tracking-wide group-hover:text-red-500 text-gray-300 transition-colors">🛑 Billing Kill-Switch</h2>
            <p className="text-sm text-gray-500 mt-2">Lockout unpaid clients. Applies universal "Service Suspended" UI overlay.</p>
          </div>
        </Link>
      </section>

      {/* Active Tenants Ledger */}
      <section className="bg-gray-900/50 backdrop-blur-md border border-gray-800 p-6 rounded-2xl shadow-lg">
        <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4">
          <h2 className="text-lg font-bold uppercase tracking-wide text-gray-300">Tenant Directory</h2>
        </div>

        <div className="overfl-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-gray-500 uppercase bg-gray-900 border-b border-gray-800">
              <tr>
                <th className="px-4 py-3">Tenant ID</th>
                <th className="px-4 py-3">Company Name</th>
                <th className="px-4 py-3">User Count</th>
                <th className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={tenant.id} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-4 font-mono text-gray-400">{tenant.id}</td>
                  <td className="px-4 py-4 font-bold text-white uppercase">{tenant.name}</td>
                  <td className="px-4 py-4 font-mono text-gray-300">{tenant.users}</td>
                  <td className="px-4 py-4 text-right">
                    <span className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-widest ${
                      tenant.status === 'ACTIVE' 
                      ? 'bg-green-900/30 text-green-500 border border-green-800' 
                      : 'bg-red-900/30 text-red-500 border border-red-800'
                    }`}>
                      {tenant.status}
                    </span>
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
