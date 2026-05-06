"use client";

import { useState } from "react";

export default function CreateCompanyOnboarding() {
  const [formData, setFormData] = useState({
    companyName: "",
    adminEmail: "",
    primaryColor: "#2563EB", // Default Blue
  });
  const [logoPreview, setLogoPreview] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Create a local URL for UI preview.
      // In production, this uploads to Supabase Storage.
      const objectUrl = URL.createObjectURL(file);
      setLogoPreview(objectUrl);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate Supabase edge function call to provision tenant
    setTimeout(() => {
      setIsSubmitting(false);
      alert(
        `Tenant [${formData.companyName}] provisioned successfully. Database RLS injected.`
      );
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 md:p-10 flex items-center justify-center">
      <div className="max-w-2xl w-full space-y-8">
        {/* Header Vault */}
        <div className="border-b border-gray-800 pb-4">
          <p className="text-blue-500 font-mono text-sm tracking-widest mb-1">
            [ SYSTEM ONBOARDING ]
          </p>
          <h1 className="text-3xl font-black text-white tracking-tight">
            Provision New Tenant
          </h1>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-gray-900 border border-gray-800 p-8 rounded-xl shadow-2xl space-y-8"
        >
          {/* Section 1: Tenant Details */}
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider">
              1. Core Details
            </h2>

            <div>
              <label className="block text-xs font-bold text-gray-400 mb-2 uppercase">
                Company / Trading Name
              </label>
              <input
                type="text"
                required
                value={formData.companyName}
                onChange={(e) =>
                  setFormData({ ...formData, companyName: e.target.value })
                }
                className="w-full bg-gray-950 border border-gray-800 rounded-lg p-4 text-white font-bold focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="e.g. Apex Security Group"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 mb-2 uppercase">
                Root Admin Email
              </label>
              <input
                type="email"
                required
                value={formData.adminEmail}
                onChange={(e) =>
                  setFormData({ ...formData, adminEmail: e.target.value })
                }
                className="w-full bg-gray-950 border border-gray-800 rounded-lg p-4 text-white font-bold focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="admin@apexsecurity.com"
              />
            </div>
          </div>

          {/* Section 2: White-Labeling */}
          <div className="space-y-4 border-t border-gray-800 pt-6">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider">
              2. White-Label Branding
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Logo Upload */}
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase">
                  Upload Client Logo
                </label>
                <div className="border-2 border-dashed border-gray-700 rounded-lg p-4 text-center hover:bg-gray-800 transition-colors cursor-pointer relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt="Logo Preview"
                      className="h-16 mx-auto object-contain"
                    />
                  ) : (
                    <span className="text-sm text-gray-500 font-bold">
                      Click to Upload PNG/JPG
                    </span>
                  )}
                </div>
              </div>

              {/* Color Picker */}
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase">
                  Primary Brand Color
                </label>
                <div className="flex items-center space-x-4 bg-gray-950 border border-gray-800 p-2 rounded-lg">
                  <input
                    type="color"
                    value={formData.primaryColor}
                    onChange={(e) =>
                      setFormData({ ...formData, primaryColor: e.target.value })
                    }
                    className="h-12 w-16 cursor-pointer bg-transparent rounded"
                  />
                  <span className="text-sm font-mono text-gray-400 font-bold">
                    {formData.primaryColor}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Submit Action */}
          <div className="pt-6 border-t border-gray-800">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-blue-600 text-white py-4 rounded-lg font-black text-lg hover:bg-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.3)] disabled:opacity-50 transition-all uppercase tracking-wide"
            >
              {isSubmitting
                ? "Provisioning Infrastructure..."
                : "Deploy New Tenant"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
