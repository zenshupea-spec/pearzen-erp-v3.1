"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  getPendingVerifications,
  processVerification,
} from "../actions/omActions";

export default function OmDashboardPage() {
  const [pendingLogs, setPendingLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [processingIds, setProcessingIds] = useState({});
  const requestIdRef = useRef(0);

  const fetchQueue = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setErrorMessage("");

    try {
      const data = await getPendingVerifications();
      if (requestIdRef.current === requestId) {
        setPendingLogs(data);
      }
    } catch (error) {
      if (requestIdRef.current === requestId) {
        setErrorMessage(error.message || "Failed to fetch verification queue.");
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleDecision = async (id, decision) => {
    if (processingIds[id]) return;

    setProcessingIds((prev) => ({ ...prev, [id]: true }));
    setErrorMessage("");

    try {
      await processVerification(id, decision);
      await fetchQueue();
    } catch (error) {
      setErrorMessage(error.message || "Error processing verification.");
    } finally {
      setProcessingIds((prev) => ({ ...prev, [id]: false }));
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">OM Command Center</h1>
        <p className="text-gray-500">3-Point Shift Verification Queue</p>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="p-4 bg-gray-50 border-b font-semibold flex justify-between items-center">
          <span>Pending Verifications ({pendingLogs.length})</span>
          <button
            onClick={fetchQueue}
            className="text-sm text-blue-600 hover:underline"
          >
            Refresh Queue
          </button>
        </div>

        {errorMessage ? (
          <div className="p-4 text-sm text-red-700 bg-red-50 border-b border-red-200">
            {errorMessage}
          </div>
        ) : null}

        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading queue...</div>
        ) : pendingLogs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No pending shifts to verify.
          </div>
        ) : (
          <div className="divide-y">
            {pendingLogs.map((log) => {
              const checkInLabel = log.check_in_time
                ? new Date(log.check_in_time).toLocaleString()
                : "Not available";
              const isProcessing = Boolean(processingIds[log.id]);

              return (
                <div
                  key={log.id}
                  className="p-6 flex flex-col md:flex-row justify-between items-center gap-4 hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <h3 className="text-lg font-bold">
                      {log.employees?.full_name || "Unknown Guard"}
                    </h3>
                    <p className="text-sm text-gray-500">Check-in: {checkInLabel}</p>
                  </div>

                  <div className="flex-1 grid grid-cols-3 gap-2 text-center text-sm">
                    <div className="p-2 border rounded bg-green-50 border-green-200">
                      <span className="block font-bold text-green-700">TIME</span>
                      <span className="text-xs">Logged</span>
                    </div>
                    <div
                      className={`p-2 border rounded ${
                        log.location_verified
                          ? "bg-green-50 border-green-200"
                          : "bg-red-50 border-red-200"
                      }`}
                    >
                      <span
                        className={`block font-bold ${
                          log.location_verified ? "text-green-700" : "text-red-700"
                        }`}
                      >
                        GPS
                      </span>
                      <span className="text-xs">
                        {log.location_verified ? "Matched" : "Flagged"}
                      </span>
                    </div>
                    <div
                      className={`p-2 border rounded ${
                        log.photo_verified
                          ? "bg-green-50 border-green-200"
                          : "bg-red-50 border-red-200"
                      }`}
                    >
                      <span
                        className={`block font-bold ${
                          log.photo_verified ? "text-green-700" : "text-red-700"
                        }`}
                      >
                        PHOTO
                      </span>
                      <span className="text-xs">
                        {log.photo_verified ? "Verified" : "Pending"}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      disabled={isProcessing}
                      onClick={() => handleDecision(log.id, "Rejected")}
                      className="px-4 py-2 border border-red-200 text-red-600 rounded hover:bg-red-50 font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      Reject
                    </button>
                    <button
                      disabled={isProcessing}
                      onClick={() => handleDecision(log.id, "Approved")}
                      className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      Approve
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

