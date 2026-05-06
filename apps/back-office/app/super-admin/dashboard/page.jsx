"use client";

import { useState, useEffect } from "react";
import {
  getAllTenants,
  toggleTenantBillingStatus,
} from "../../actions/superAdminActions";

export default function SuperAdminDashboard() {
  const [tenants, setTenants] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    async function loadTenants() {
      setIsLoading(true);
      const response = await getAllTenants();
      if (response.success) {
        setTenants(response.data);
      } else {
        console.error("Failed to load tenants:", response.error);
      }
      setIsLoading(false);
    }
    loadTenants();
  }, []);

  // Live Billing Kill-Switch Logic
  const handleToggleLockout = async (id, currentStatus) => {
    const confirmMsg =
      currentStatus === "ACTIVE"
        ? `WARNING: This will instantly lock out tenant ${id}. Proceed?`
        : `Restore access for tenant ${id}?`;

    if (!window.confirm(confirmMsg)) return;

    setProcessingId(id);
    const response = await toggleTenantBillingStatus(id, currentStatus);

    if (response.success) {
      // Update UI instantly
      setTenants(
        tenants.map((tenant) =>
          tenant.id === id ? { ...tenant, status: response.newStatus } : tenant
        )
      );
    } else {
      alert(`Failed to update billing status: ${response.error}`);
    }
    setProcessingId(null);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 md:p-10">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header Vault */}
        <div className="border-b border-gray-800 pb-6 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div>
            <p className="text-red-500 font-mono text-sm tracking-widest mb-2">
              [ ROOT ACCESS GRANTED ]
            </p>
            <h1 className="text-4xl font-black text-white tracking-tight">
              The SaaS Forge
            </h1>
            <p className="text-gray-400 mt-2 font-medium">
              Global Multi-Tenant Control Panel
            </p>
          </div>
          <button className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-md font-bold transition-all shadow-[0_0_15px_rgba(37,99,235,0.4)]">
            + Onboard New Company
          </button>
        </div>

        {/* Tenant Matrix */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto shadow-2xl">
          {isLoading ? (
            <div className="p-10 text-center font-bold text-gray-500 animate-pulse">
              Scanning Global Infrastructure...
            </div>
          ) : tenants.length === 0 ? (
            <div className="p-10 text-center font-bold text-gray-500">
              No tenants found in the database.
            </div>
          ) : (
            <table className="w-full text-left min-w-[800px]">
              <thead className="bg-gray-950 border-b border-gray-800 text-xs uppercase tracking-wider text-gray-500 font-bold">
                <tr>
                  <th className="p-5">Tenant ID & Name</th>
                  <th className="p-5">Active Modules</th>
                  <th className="p-5">Billing Status</th>
                  <th className="p-5 text-right">Global Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {tenants.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-gray-800/50 transition-colors">
                    <td className="p-5">
                      <div className="font-mono text-xs text-gray-500">
                        {tenant.id}
                      </div>
                      <div className="font-bold text-lg text-white mt-1">
                        {tenant.name}
                      </div>
                    </td>
                    <td className="p-5">
                      <div className="flex flex-wrap gap-2">
                        {tenant.modules && Array.isArray(tenant.modules) ? (
                          tenant.modules.map((mod) => (
                            <span
                              key={mod}
                              className="bg-gray-950 border border-gray-700 text-gray-300 text-xs px-2 py-1 rounded font-medium tracking-wide"
                            >
                              {mod}
                            </span>
                          ))
                        ) : (
                          <span className="text-gray-600 text-xs">Standard</span>
                        )}
                      </div>
                    </td>
                    <td className="p-5">
                      <span
                        className={`px-3 py-1.5 text-xs font-black rounded-sm uppercase tracking-widest ${
                          tenant.status === "ACTIVE"
                            ? "bg-green-950 text-green-400 border border-green-900/50"
                            : "bg-red-950 text-red-400 border border-red-900/50 animate-pulse"
                        }`}
                      >
                        {tenant.status}
                      </span>
                    </td>
                    <td className="p-5 text-right space-x-4">
                      <button className="text-sm font-bold text-gray-500 hover:text-white transition-colors">
                        Configure
                      </button>
                      <button
                        onClick={() => handleToggleLockout(tenant.id, tenant.status)}
                        disabled={processingId === tenant.id}
                        className={`text-xs font-black px-4 py-2.5 rounded shadow transition-all tracking-wider uppercase disabled:opacity-50 ${
                          tenant.status === "ACTIVE"
                            ? "bg-red-900/80 hover:bg-red-600 text-red-100"
                            : "bg-green-900/80 hover:bg-green-600 text-green-100"
                        }`}
                      >
                        {processingId === tenant.id
                          ? "Applying..."
                          : tenant.status === "ACTIVE"
                            ? "Kill-Switch"
                            : "Restore Access"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
