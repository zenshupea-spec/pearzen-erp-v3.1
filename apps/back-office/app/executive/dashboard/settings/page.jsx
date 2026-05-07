"use client";

import { useEffect, useState } from "react";
import { getSettings, updateSettings } from "../../../actions/settingsActions";

export const dynamic = "force-dynamic";

export default function ExecutiveSettings() {
  // Mock state for company settings - will wire to Supabase company_configs table
  const [settings, setSettings] = useState({
    companyName: "Apex Security Solutions",
    hospitalityModule: false,
    advancedGeofencing: true,
    autoApprovePayroll: false,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState("");

  useEffect(() => {
    async function loadSettings() {
      setIsLoadingSettings(true);
      setStatusMessage("");

      const response = await getSettings();
      if (response.success && response.data) {
        setSettings((prev) => ({
          ...prev,
          hospitalityModule: Boolean(response.data.hospitality_module),
          advancedGeofencing: Boolean(response.data.advanced_geofencing),
          autoApprovePayroll: Boolean(response.data.auto_approve_payroll),
        }));
      } else if (!response.success) {
        setStatusType("error");
        setStatusMessage(response.error || "Failed to load settings from database.");
      }

      setIsLoadingSettings(false);
    }

    loadSettings();
  }, []);

  const handleToggle = (key) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setStatusMessage("");

    const response = await updateSettings({
      hospitality_module: settings.hospitalityModule,
      advanced_geofencing: settings.advancedGeofencing,
      auto_approve_payroll: settings.autoApprovePayroll,
    });

    if (response.success) {
      setStatusType("success");
      setStatusMessage("Settings securely saved to vault.");
    } else {
      setStatusType("error");
      setStatusMessage(response.error || "Failed to save configuration.");
    }

    setIsSaving(false);
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

        {statusMessage ? (
          <div
            className={`p-3 rounded-xl text-sm font-medium ${
              statusType === "success"
                ? "bg-green-50 border border-green-200 text-green-700"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}
          >
            {statusMessage}
          </div>
        ) : null}

        {isLoadingSettings ? (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-gray-500 font-semibold text-center">
            Loading current settings...
          </div>
        ) : (
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
        )}
      </div>
    </div>
  );
}
