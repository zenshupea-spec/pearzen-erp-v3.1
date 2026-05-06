"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function TenantManager() {
  const params = useParams();
  const router = useRouter();
  const tenantId = params?.id || "TEN-UNKNOWN";

  // Mock initial state - will be wired to Supabase 'companies' table by ID
  const [tenant, setTenant] = useState({
    id: tenantId,
    name: "Apex Security Solutions",
    status: "ACTIVE", // ACTIVE, UNPAID, SUSPENDED
    modules: {
      guard_pwa: true,
      hospitality: false,
      cleaning: true,
      executive_vault: true,
    },
  });

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setTenant((prev) => ({ ...prev, id: tenantId }));
  }, [tenantId]);

  const handleModuleToggle = (moduleKey) => {
    setTenant((prev) => ({
      ...prev,
      modules: {
        ...prev.modules,
        [moduleKey]: !prev.modules[moduleKey],
      },
    }));
  };

  const handleStatusChange = (e) => {
    setTenant((prev) => ({ ...prev, status: e.target.value }));
  };

  const handleSave = () => {
    setIsSaving(true);
    // Simulate Supabase Update (e.g., UPDATE companies SET status = 'UNPAID' WHERE id = tenantId)
    setTimeout(() => {
      setIsSaving(false);
      alert(`Tenant [${tenant.id}] configuration updated successfully.`);
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 md:p-10 flex justify-center">
      <div className="max-w-3xl w-full space-y-8">
        {/* Header Vault */}
        <div className="flex justify-between items-end border-b border-gray-800 pb-4">
          <div>
            <button
              onClick={() => router.back()}
              className="text-gray-500 hover:text-white text-sm font-bold mb-4 flex items-center"
            >
              ← Back to Forge Matrix
            </button>
            <p className="text-yellow-500 font-mono text-sm tracking-widest mb-1">
              [ TENANT CONFIGURATION ]
            </p>
            <h1 className="text-3xl font-black text-white tracking-tight">
              {tenant.name}
            </h1>
            <p className="text-gray-500 font-mono text-sm mt-1">ID: {tenant.id}</p>
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-md font-bold transition-all shadow-[0_0_15px_rgba(37,99,235,0.4)] disabled:opacity-50 uppercase tracking-wide"
          >
            {isSaving ? "Applying..." : "Save Global Changes"}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Billing & Access Kill-Switch */}
          <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl shadow-xl space-y-6">
            <div>
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">
                Access Control
              </h2>
              <p className="text-xs text-gray-600">
                Setting to UNPAID will trigger RLS lockouts for all users under
                this company_id.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 mb-2 uppercase">
                Billing Status
              </label>
              <select
                value={tenant.status}
                onChange={handleStatusChange}
                className={`w-full bg-gray-950 border-2 rounded-lg p-4 font-black uppercase tracking-widest outline-none transition-colors ${
                  tenant.status === "ACTIVE"
                    ? "border-green-900/50 text-green-400 focus:border-green-500"
                    : tenant.status === "UNPAID"
                      ? "border-red-900/50 text-red-500 focus:border-red-500"
                      : "border-yellow-900/50 text-yellow-500 focus:border-yellow-500"
                }`}
              >
                <option value="ACTIVE">Active & Paid</option>
                <option value="UNPAID">Unpaid (Kill-Switch)</option>
                <option value="SUSPENDED">Suspended (TOS Violation)</option>
              </select>
            </div>

            {tenant.status === "UNPAID" && (
              <div className="bg-red-950/50 border border-red-900 p-4 rounded text-sm text-red-200 font-medium">
                ⚠️ <strong className="text-red-400">WARNING:</strong> Saving this
                will instantly disconnect all field guards and revoke Head Office
                access for {tenant.name}.
              </div>
            )}
          </div>

          {/* Global Module Manager */}
          <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl shadow-xl space-y-6">
            <div>
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">
                Module Provisioning
              </h2>
              <p className="text-xs text-gray-600">
                Toggle SaaS features available to this tenant.
              </p>
            </div>

            <div className="space-y-3">
              {Object.entries(tenant.modules).map(([key, isActive]) => (
                <div
                  key={key}
                  className="flex items-center justify-between p-3 bg-gray-950 border border-gray-800 rounded-lg"
                >
                  <div>
                    <p className="font-bold text-gray-200 uppercase tracking-wide text-sm">
                      {key.replace("_", " ")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleModuleToggle(key)}
                    className={`w-14 h-8 rounded-full p-1 transition-colors duration-200 ease-in-out focus:outline-none ${
                      isActive ? "bg-blue-600" : "bg-gray-700"
                    }`}
                  >
                    <div
                      className={`w-6 h-6 bg-white rounded-full shadow transform transition-transform duration-200 ${
                        isActive ? "translate-x-6" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
