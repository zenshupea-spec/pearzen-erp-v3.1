"use client";

import { useState } from "react";

export default function ExecutiveSettings() {
  // Mock state for company settings - will wire to Supabase company_configs table
  const [settings, setSettings] = useState({
    companyName: "Apex Security Solutions",
    hospitalityModule: false,
    advancedGeofencing: true,
    autoApprovePayroll: false,
  });

  const [isSaving, setIsSaving] = useState(false);

  const handleToggle = (key) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = (e) => {
    e.preventDefault();
    setIsSaving(true);
    // Simulate API delay
    setTimeout(() => {
      setIsSaving(false);
      alert("Settings securely saved to vault.");
    }, 800);
  };

  return (
    // Mobile-first constraint container matching the Executive Dashboard
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-md mx-auto space-y-6">
        {/* Header Vault */}
        <div className="flex justify-between items-center bg-gray-900 text-white p-5 rounded-3xl shadow-xl border border-gray-800">
          <div>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">
              Executive Vault
            </p>
            <h1 className="text-2xl font-black mt-1">Settings</h1>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* General Profile */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">
              Company Profile
            </h2>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Trading Name
              </label>
              <input
                type="text"
                value={settings.companyName}
                onChange={(e) =>
                  setSettings({ ...settings, companyName: e.target.value })
                }
                className="w-full border-2 border-gray-200 rounded-xl p-3 text-gray-900 font-bold focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
          </div>

          {/* Module Toggles */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">
              Active Modules
            </h2>

            {/* Toggle 1 */}
            <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <div>
                <p className="font-bold text-gray-900">Hospitality Module</p>
                <p className="text-xs text-gray-500">
                  Enable Blind Float & Recipe Book
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggle("hospitalityModule")}
                className={`w-14 h-8 rounded-full p-1 transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings.hospitalityModule ? "bg-blue-600" : "bg-gray-200"
                }`}
              >
                <div
                  className={`w-6 h-6 bg-white rounded-full shadow transform transition-transform duration-200 ${
                    settings.hospitalityModule ? "translate-x-6" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Toggle 2 */}
            <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <div>
                <p className="font-bold text-gray-900">Advanced Geofencing</p>
                <p className="text-xs text-gray-500">
                  Strict 100m radius check-ins
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggle("advancedGeofencing")}
                className={`w-14 h-8 rounded-full p-1 transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings.advancedGeofencing ? "bg-blue-600" : "bg-gray-200"
                }`}
              >
                <div
                  className={`w-6 h-6 bg-white rounded-full shadow transform transition-transform duration-200 ${
                    settings.advancedGeofencing ? "translate-x-6" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Toggle 3 */}
            <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <div>
                <p className="font-bold text-gray-900">Auto-Approve Payroll</p>
                <p className="text-xs text-gray-500">
                  Bypass FM manual verification
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggle("autoApprovePayroll")}
                className={`w-14 h-8 rounded-full p-1 transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings.autoApprovePayroll ? "bg-blue-600" : "bg-gray-200"
                }`}
              >
                <div
                  className={`w-6 h-6 bg-white rounded-full shadow transform transition-transform duration-200 ${
                    settings.autoApprovePayroll ? "translate-x-6" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold text-lg hover:bg-gray-800 shadow-lg disabled:opacity-50 transition-all"
          >
            {isSaving ? "Encrypting & Saving..." : "Save Configuration"}
          </button>
        </form>
      </div>
    </div>
  );
}
