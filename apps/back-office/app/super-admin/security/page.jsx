"use client";

import { useState } from "react";

export default function SecuritySweep() {
  const [isRotating, setIsRotating] = useState(false);

  // Mock global audit logs - will wire to Supabase edge function logs
  const [logs] = useState([
    {
      id: 1,
      time: "10:42 AM",
      event: "Failed login attempt (Root)",
      ip: "192.168.1.45",
      status: "Blocked",
    },
    {
      id: 2,
      time: "09:15 AM",
      event: "Tenant [TEN-002] Set to UNPAID",
      ip: "Admin IP",
      status: "Success",
    },
    {
      id: 3,
      time: "08:00 AM",
      event: "Daily Automated DB Backup",
      ip: "System",
      status: "Success",
    },
  ]);

  const handleKeyRotation = () => {
    const confirmRotate = window.confirm(
      "CRITICAL WARNING: Rotating master keys will force-logout all active sessions across ALL client companies. Proceed?"
    );
    if (!confirmRotate) return;

    setIsRotating(true);

    // Simulate Edge Function calling Supabase Management API to rotate JWT secret
    setTimeout(() => {
      setIsRotating(false);
      alert("Master keys rotated successfully. All tenant sessions invalidated.");
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header Vault */}
        <div className="border-b border-gray-800 pb-6 flex items-end justify-between">
          <div>
            <p className="text-red-500 font-mono text-sm tracking-widest mb-1">
              [ DEFENSE MATRIX ]
            </p>
            <h1 className="text-3xl font-black text-white tracking-tight">
              Security & Key Management
            </h1>
          </div>
          <div className="bg-green-950/30 border border-green-900/50 px-4 py-2 rounded">
            <span className="text-green-400 font-bold text-sm tracking-widest uppercase">
              System Status: Secure
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Key Rotation Panel */}
          <div className="lg:col-span-1 bg-gray-900 border border-gray-800 p-6 rounded-xl shadow-2xl space-y-6 flex flex-col justify-between">
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">
                  Cryptographic Vault
                </h2>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Manage global Supabase environment variables and active JWT
                  secrets.
                </p>
              </div>

              <div className="bg-gray-950 p-5 rounded-lg border border-gray-800">
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">
                  Current JWT Hash
                </p>
                <p className="font-mono text-sm text-green-400 truncate">
                  sha256:8f4b2c...a19d
                </p>
                <p className="text-xs text-gray-600 mt-3 font-bold">
                  Last rotated: 45 days ago
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-6 border-t border-gray-800">
              <button
                onClick={handleKeyRotation}
                disabled={isRotating}
                className="w-full bg-red-900/80 hover:bg-red-600 text-red-100 py-4 rounded-lg font-black uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(220,38,38,0.2)] disabled:opacity-50"
              >
                {isRotating ? "Regenerating Keys..." : "Rotate Master Keys"}
              </button>
              <p className="text-xs text-red-500 font-bold text-center uppercase tracking-wide">
                ⚠️ Drops all active connections instantly
              </p>
            </div>
          </div>

          {/* Security Logs */}
          <div className="lg:col-span-2 bg-gray-900 border border-gray-800 p-6 rounded-xl shadow-2xl space-y-6">
            <div>
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">
                Global Audit Trail
              </h2>
              <p className="text-xs text-gray-500 leading-relaxed">
                Live feed of critical infrastructure events across the entire
                monorepo.
              </p>
            </div>

            <div className="overflow-x-auto rounded-lg border border-gray-800">
              <table className="w-full text-left text-sm min-w-[500px]">
                <thead className="bg-gray-950 text-gray-500 font-bold uppercase tracking-wider text-xs border-b border-gray-800">
                  <tr>
                    <th className="p-4">Time</th>
                    <th className="p-4">Event</th>
                    <th className="p-4">Origin IP</th>
                    <th className="p-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800 text-gray-300 bg-gray-900">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-800/50 transition-colors">
                      <td className="p-4 font-mono text-xs text-gray-400">
                        {log.time}
                      </td>
                      <td className="p-4 font-bold">{log.event}</td>
                      <td className="p-4 font-mono text-xs text-gray-500">
                        {log.ip}
                      </td>
                      <td className="p-4 text-right">
                        <span
                          className={`px-3 py-1.5 text-[10px] font-black rounded uppercase tracking-widest ${
                            log.status === "Success"
                              ? "bg-green-900/30 text-green-400 border border-green-900/50"
                              : "bg-red-900/30 text-red-400 border border-red-900/50"
                          }`}
                        >
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
