import { getLocalLogs, clearLocalLog } from "./idb";
import { supabase } from "./supabase";

export interface TimeCheckResult {
  isValid: boolean;
  offsetMinutes: number;
  flag?: "RED_FLAG_TAMPERING" | "OFFLINE_BYPASS" | "CLEAN";
}

export const verifyDualClock = async (): Promise<TimeCheckResult> => {
  const deviceTime = Date.now();

  try {
    const response = await fetch("/api/time", { cache: "no-store" });
    if (!response.ok) throw new Error("Network time fetch failed");

    const { serverTime } = await response.json();
    const timeDiffMinutes = Math.abs(serverTime - deviceTime) / (1000 * 60);

    // 5-Minute Strict Threshold
    if (timeDiffMinutes > 5) {
      console.error(
        `🔴 RED FLAG: Time tampering detected. Offset: ${timeDiffMinutes.toFixed(2)} mins`
      );
      return {
        isValid: false,
        offsetMinutes: timeDiffMinutes,
        flag: "RED_FLAG_TAMPERING",
      };
    }

    return { isValid: true, offsetMinutes: timeDiffMinutes, flag: "CLEAN" };
  } catch {
    // Device is offline. We cannot verify time.
    // Tag for the OM Portal to review the GPS timestamp later.
    console.warn("🟡 OFFLINE: Cannot verify dual-clock. Bypassing locally.");
    return { isValid: true, offsetMinutes: 0, flag: "OFFLINE_BYPASS" };
  }
};

// Background Sync Function
export const syncOfflineLogs = async () => {
  if (!navigator.onLine) return;

  const logs = await getLocalLogs();
  if (logs.length === 0) return;

  console.log(`🔄 Attempting to sync ${logs.length} offline logs...`);

  for (const log of logs) {
    try {
      const { id, ...logData } = log;
      const { error } = await supabase.from("attendance_logs").insert([logData]);

      if (!error && id) {
        await clearLocalLog(id);
      }
    } catch (err) {
      console.error(`Failed to sync log ${log.id}:`, err);
    }
  }
};

