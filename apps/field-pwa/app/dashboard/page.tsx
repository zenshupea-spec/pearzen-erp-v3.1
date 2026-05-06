"use client";

import { useEffect, useState } from "react";
import AttendanceAction from "./AttendanceAction";
import { syncOfflineLogs } from "../../lib/time-check";
import { getLocalLogs, clearLocalLog } from "../../lib/idb";
import { supabase } from "../../lib/supabase";

export default function DashboardPage() {
  const [syncing, setSyncing] = useState(false);

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const logs = await getLocalLogs();
      if (logs.length === 0) {
        alert("✅ All systems are synced. No offline logs found.");
        return;
      }

      console.log(`🔄 Attempting manual sync of ${logs.length} logs...`);
      let successCount = 0;

      for (const log of logs) {
        const { id, ...logData } = log;

        const { error } = await supabase.from("attendance_logs").insert([logData]);

        if (error) {
          console.error(
            `🔴 Supabase rejected log ${id}:`,
            error.message,
            error.details
          );
          alert(`Sync Failed: ${error.message}`);
        } else if (id) {
          await clearLocalLog(id);
          successCount++;
        }
      }

      if (successCount > 0) {
        alert(`✅ Successfully synced ${successCount} offline logs to HQ!`);
      }
    } catch (err) {
      console.error("Critical Sync Error:", err);
      alert("A critical error occurred during sync.");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    // 1. Try to sync immediately when the dashboard loads
    if (navigator.onLine) {
      syncOfflineLogs();
    }

    // 2. Listen for the browser reconnecting to the internet
    const handleOnline = () => {
      console.log("🌐 Connection restored. Syncing offline logs...");
      syncOfflineLogs();
    };

    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="p-4 sm:p-6 max-w-md mx-auto">
        <header className="flex items-start justify-between gap-4 mb-5">
          <div>
            <div className="text-sm text-zinc-300">PEARZEN ERP</div>
            <h1 className="mt-1 text-xl font-semibold">Guard Dashboard</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.8)]"></span>
            <span className="text-sm font-medium tracking-wider">ONLINE</span>
          </div>
        </header>

        <div className="bg-white/5 border border-white/10 rounded-xl p-4 backdrop-blur-md mb-8">
          <div className="text-sm text-zinc-400 mb-1">MTD</div>
          <div className="text-lg font-medium">Live MTD Earnings: LKR 0.00</div>
        </div>

        <AttendanceAction
          shiftId="SHIFT_DUMMY"
          targetLat={0}
          targetLng={0}
          geofenceRadius={50}
          onComplete={() => {
            alert("✅ Check-in completed.");
          }}
        />

        <div className="mt-8 pt-4 border-t border-gray-700">
          <button
            type="button"
            onClick={handleManualSync}
            disabled={syncing}
            className="w-full py-4 bg-yellow-600 hover:bg-yellow-500 rounded font-bold uppercase tracking-widest text-white disabled:opacity-50"
          >
            {syncing ? "SYNCING TO HQ..." : "FORCE SYNC OFFLINE LOGS"}
          </button>
        </div>
      </div>
    </main>
  );
}