'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function NewTenant() {
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  
  const [formData, setFormData] = useState({
    companyName: '',
    adminEmail: '',
    contactNumber: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProvisioning(true);
    setStatusMsg('INITIALIZING ISOLATED TENANT SCHEMA...');

    // Placeholder for Phase 8 DB Wiring (Supabase Insert)
    setTimeout(() => {
      setStatusMsg('GENERATING UNIQUE COMPANY_ID...');
      setTimeout(() => {
        setIsProvisioning(false);
        setStatusMsg('✔ TENANT SUCCESSFULLYROVISIONED');
      }, 1500);
    }, 1500);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-800 pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold uppercase tracking-widest text-white">
            Provision Tenant
          </h1>
          <p className="text-gray-500 text-sm uppercase tracking-wide mt-1">
            Initialize isolated company instance
          </p>
        </div>
        <Link href="/forge" className="bg-gray-900 border border-gray-700 px-4 py-2 rounded-lg text-sm uppercase font-bold hover:bg-gray-800 transition-colors text-white">
          Back
        </Link>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Core Details */}
        <section className="bg-gray-900/50 backdrop-blur-md border border-gray-800 p-6 rounded-2xl shadow-lg">
          <h2 className="text-lg font-bold uppercase tracking-wide text-gray-300 mb-4 border-b border-gray-700 pb-2">1. Corporate Details</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Registered Company Name</label>
              <input 
                type="text" 
                required
                value={formData.companyName}
                onChange={(e) => setFormData({...formData, companyName: e.target.value.toUpperCase()})}
                placeholder="E.G. APEX SECURITY SOLUTIONS"
                className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white font-mono focus:ring-2 focus:ring-gray-500 outline-none uppercase"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Primary Admin Email</label>
                <input 
                  type="email" 
                  required
                  value={formData.adminEmail}
                  onChange={(e) => setFormData({...formData, adminEmail: e.target.value.toUpperCase()})}
                  placeholder="ADMIN@COMPANY.COM"
                  className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white font-mono focus:ring-2 focus:ring-gray-500 outline-none uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Contact Number</label>
                <input 
                  type="text" 
                  required
                  value={formData.contactNumber}
                  onChange={(e) => setFormData({...formData, contactNumber: e.target.value.toUpperCase()})}
                  placeholder="+94 77 123 4567"
                  className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white font-mono focus:ring-2 focus:ring-gray-500 outline-none uppercase"
                />
              </div>
            </div>
          </div>
        </section>

        {/* White-Label Assets */}
        <section className="bg-gray-900/50 backdrop-blur-md border border-gray-800 p-6 rounded-2xl shadow-lg">
          <h2 className="text-lg font-bold uppercase tracking-wide text-gray-300 mb-4 border-b border-gray-700 pb-2">2. White-Label Assets</h2>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Upload Corporate Logo</label>
            <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-700 border-dashed rounded-lg cursor-pointer bg-black hover:bg-gray-900 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <p className="mb-2 text-sm text-gray-500 uppercase font-bold"><span className="text-gray-300">Click to upload</span> or drag and drop</p>
                  <p className="text-xs text-gray-600 uppercase font-mono">PNG, JPG or WEBP (MAX. 2MB)</p>
                </div>
                <input type="file" className="hidden" accept="image/png, image/jpeg, image/webp" />
              </label>
            </div>
          </div>
        </section>

        {/* Action Bar */}
        <div className="pt-4">
          <button 
            type="submit" 
            disabled={isProvisioning}
            className="w-full bg-gray-200 hover:bg-white text-black font-bold py-4 rounded-xl transition-all uppercase tracking-widest disabled:opacity-50"
          >
            {isProvisioning ? 'Working...' : 'Provision New Tenant'}
          </button>
          
          <div className="h-6 mt-4 text-center">
            {statusMsg && (
              <p className={`text-sm font-mono uppercase font-bold ${statusMsg.includes('✔') ? 'text-green-400' : 'text-gray-400 animate-pulse'}`}>
                {statusMsg}
              </p>
            )}
          </div>
        </div>
      </form>
    </div>
  )}
