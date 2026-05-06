"use client";

import { useState, useEffect } from "react";
// THE FIX: We are correctly importing approveShift here
import { getPendingVerifications, approveShift } from "../../actions/omActions";

export default function OMCommandCenter() {
  const [verifications, setVerifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchQueue = async () => {
    setIsLoading(true);
    const response = await getPendingVerifications();
    if (response.success) {
      setVerifications(response.data);
    } else {
      console.error("Fetch error:", response.error);
    }
    setIsLoading(false);
  };

  // Initial load
  useEffect(() => {
    fetchQueue();
  }, []);

  const handleApprove = async (shiftId) => {
    setIsProcessing(true);
    const response = await approveShift(shiftId);

    if (response.success) {
      // Remove the approved shift from the UI immediately
      setVerifications(verifications.filter((v) => v.id !== shiftId));
    } else {
      alert(`Approval failed: ${response.error}`);
    }
    setIsProcessing(false);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 md:p-10">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header Panel */}
        <div className="border-b border-gray-800 pb-6 flex justify-between items-end">
          <div>
            <p className="text-blue-500 font-mono text-sm tracking-widest mb-1">
              [ OM COMMAND CENTER ]
            </p>
            <h1 className="text-3xl font-black text-white tracking-tight">
              3-Point Shift Verification Queue
            </h1>
          </div>
          <button
            onClick={fetchQueue}
            disabled={isLoading}
            className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-md font-bold transition-all disabled:opacity-50 text-sm border border-gray-700 shadow-sm"
          >
            {isLoading ? "Syncing..." : "Refresh Queue"}
          </button>
        </div>

        {/* Live Data Grid */}
        {isLoading ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center text-gray-500 font-bold animate-pulse">
            Establishing secure uplink to Supabase Database...
          </div>
        ) : verifications.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center shadow-xl">
            <p className="text-green-400 font-mono font-bold mb-2">SYSTEM CLEAR</p>
            <p className="text-gray-500">
              No pending shifts to verify in the queue.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {verifications.map((shift) => (
              <div
                key={shift.id}
                className="bg-gray-900 border border-gray-800 p-6 rounded-xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 hover:border-gray-700 transition-colors"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="bg-yellow-900/50 text-yellow-500 border border-yellow-700/50 px-2 py-1 text-xs font-bold rounded uppercase tracking-wider">
                      Pending
                    </span>
                    <span className="font-mono text-sm text-gray-400">
                      ID: {shift.id.split("-")[0]}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-white">
                    Profile ID:{" "}
                    <span className="text-gray-400 text-sm">{shift.profile_id}</span>
                  </h2>
                  <p className="text-sm text-gray-400 font-medium">
                    Location ID: {shift.location_id}
                  </p>
                </div>

                <div className="bg-gray-950 p-4 rounded-lg border border-gray-800 min-w-[200px]">
                  <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">
                    Created At
                  </p>
                  <p className="font-mono text-sm text-white">
                    {new Date(shift.created_at).toLocaleString()}
                  </p>
                </div>

                <button
                  onClick={() => handleApprove(shift.id)}
                  disabled={isProcessing}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-lg font-black uppercase tracking-wide transition-all shadow-[0_0_15px_rgba(37,99,235,0.3)] disabled:opacity-50 whitespace-nowrap"
                >
                  Verify & Approve
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
