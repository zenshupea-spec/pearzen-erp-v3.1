"use client";

import { useState, useEffect } from "react";
import { getExecutiveMetrics } from "../../actions/executiveActions";

export default function ExecutiveDashboard() {
  const [metrics, setMetrics] = useState({
    revenue: 0,
    activeGuards: 0,
    pendingIncidents: 0,
    unpaidInvoices: 1,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadMetrics() {
      setIsLoading(true);
      const response = await getExecutiveMetrics();
      if (response.success) {
        setMetrics(response.data);
      } else {
        console.error("Failed to load metrics:", response.error);
      }
      setIsLoading(false);
    }
    loadMetrics();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-md mx-auto space-y-6">
        {/* Header Vault */}
        <div className="flex justify-between items-center bg-gray-900 text-white p-5 rounded-3xl shadow-xl border border-gray-800">
          <div>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">
              Executive Vault
            </p>
            <h1 className="text-2xl font-black mt-1">Overview</h1>
          </div>
          <div className="h-12 w-12 bg-blue-600 rounded-full flex items-center justify-center font-bold text-xl shadow-inner">
            MD
          </div>
        </div>

        {isLoading ? (
          <div className="text-center p-10 font-bold text-gray-400 animate-pulse">
            Decrypting Financial Engine Data...
          </div>
        ) : (
          <>
            {/* Critical Alerts */}
            {metrics.pendingIncidents > 0 && (
              <div className="bg-red-50 border-l-4 border-red-600 p-4 rounded-r-xl shadow-sm">
                <p className="text-red-800 font-bold text-sm tracking-wide">
                  Action Required: {metrics.pendingIncidents} Pending Shift
                  Verifications
                </p>
              </div>
            )}

            {/* Key Metrics Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                  Est. Payroll Liability
                </p>
                <p className="text-lg font-black mt-1 text-gray-900">
                  LKR {metrics.revenue.toLocaleString()}
                </p>
              </div>
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                  Active Field Staff
                </p>
                <p className="text-2xl font-black mt-1 text-gray-900">
                  {metrics.activeGuards}
                </p>
              </div>
            </div>

            {/* Quick Actions Menu */}
            <div className="space-y-3 pt-2">
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider px-2">
                Action Center
              </h2>

              <button className="w-full bg-white border border-gray-200 p-5 rounded-2xl shadow-sm flex justify-between items-center hover:bg-gray-50 active:scale-[0.98] transition-all">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  <span className="font-bold text-gray-800">
                    Approve Payroll Batch
                  </span>
                </div>
                <span className="text-gray-300 font-bold">→</span>
              </button>

              <button className="w-full bg-white border border-gray-200 p-5 rounded-2xl shadow-sm flex justify-between items-center hover:bg-gray-50 active:scale-[0.98] transition-all">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full" />
                  <span className="font-bold text-gray-800">
                    Company Settings
                  </span>
                </div>
                <span className="text-gray-300 font-bold">→</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
