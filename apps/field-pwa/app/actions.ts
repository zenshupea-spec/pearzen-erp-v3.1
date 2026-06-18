'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServiceClient } from '../../../packages/supabase/server';
import { getDistanceInMeters } from '../lib/geofence';
import {
  findOpenCheckIn,
  maybeAutoCheckoutGuard,
} from '../../../packages/supabase/guard-auto-checkout';
import {
  applyMdSettingsShiftWindow,
  findActiveEmployeeByRosterKey,
  fetchSecurityShiftTiming,
  resolveActiveShiftForToday,
  resolveShiftAtCheckInTime,
  resolveUpcomingShifts,
} from '../lib/guard-shift-resolver';

/** Normal manual checkout: from shift end until 1h after (e.g. 7:00–8:00 AM). */
const CHECKOUT_WINDOW_MS = 60 * 60 * 1000;

function checkoutWindowStart(endTimeIso: string): Date {
  return new Date(endTimeIso);
}

function checkoutWindowEnd(endTimeIso: string): Date {
  return new Date(new Date(endTimeIso).getTime() + CHECKOUT_WINDOW_MS);
}

function resolveLogStatus(
  actionType: 'CHECK_IN' | 'CHECK_OUT',
  deviceTime: string,
  plannedEndTime: string | null,
  checkoutFlag?: 'EARLY' | 'NORMAL',
): 'PENDING' | 'FLAGGED' {
  if (actionType === 'CHECK_IN') return 'PENDING';

  if (checkoutFlag === 'EARLY') return 'FLAGGED';
  if (!plannedEndTime) return 'PENDING';

  const deviceDate = new Date(deviceTime);
  const windowStart = checkoutWindowStart(plannedEndTime);
  const windowEnd = checkoutWindowEnd(plannedEndTime);
  if (deviceDate < windowStart || deviceDate > windowEnd) return 'FLAGGED';

  return 'PENDING';
}

// ==========================================
// 1. TIME ENGINE: SHIFT STATE CHECKER
// ==========================================
export async function getGuardAttendanceState(empNumber: string) {
  try {
    const supabase = createSupabaseServiceClient();
    await maybeAutoCheckoutGuard(supabase, empNumber);

    const openCheckIn = await findOpenCheckIn(supabase, empNumber);
    const employee = await findActiveEmployeeByRosterKey(supabase, empNumber);

    if (!employee) {
      return {
        status: 'IDLE',
        message: 'NO ACTIVE SHIFT SCHEDULED FOR TODAY.',
      };
    }

    const anchorTime = openCheckIn
      ? new Date(openCheckIn.device_time)
      : new Date();

    const shift = openCheckIn
      ? await resolveShiftAtCheckInTime(supabase, employee, anchorTime)
      : (await resolveActiveShiftForToday(supabase, empNumber, anchorTime))?.shift ?? null;

    if (!shift) {
      return {
        status: 'IDLE',
        message: 'NO ACTIVE SHIFT SCHEDULED FOR TODAY.',
      };
    }

    const startTimes = await fetchSecurityShiftTiming(supabase, employee.company_id);
    const window = applyMdSettingsShiftWindow(shift.shiftDate, shift.shiftType, startTimes);
    const plannedStartTime = window?.plannedStartTime ?? shift.plannedStartTime;
    const plannedEndTime = window?.plannedEndTime ?? shift.plannedEndTime;

    const nextAction = openCheckIn ? 'CHECK_OUT' : 'CHECK_IN';
    const checkoutOpensAt = checkoutWindowStart(plannedEndTime).toISOString();
    const checkoutClosesAt = checkoutWindowEnd(plannedEndTime).toISOString();

    return {
      status: 'READY',
      nextAction,
      shiftId: shift.shiftId,
      guardName: employee.full_name,
      locationName: shift.siteName,
      startTime: plannedStartTime,
      endTime: plannedEndTime,
      checkoutOpensAt,
      checkoutClosesAt,
      siteLat: shift.siteLat,
      siteLng: shift.siteLng,
      geofenceRadius: shift.geofenceRadius,
      verificationMode: shift.verificationMode,
      nfcTagId: shift.nfcTagId,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ FIELD API ERROR:', message);
    return { status: 'ERROR', message: 'CRITICAL SYSTEM FAILURE.' };
  }
}

// ==========================================
// 2. SELFIE DECODER (HELPER)
// ==========================================
function decodeBase64Image(photoBase64: string): {
  buffer: Buffer;
  contentType: string;
  extension: string;
} | null {
  const trimmed = photoBase64.trim();
  if (!trimmed) return null;

  const dataUrlMatch = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i);
  if (dataUrlMatch) {
    const contentType = dataUrlMatch[1].toLowerCase();
    const base64Data = dataUrlMatch[2];
    const extByMime: Record<string, string> = {
      'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    };
    const extension = extByMime[contentType] ?? 'jpg';
    return { buffer: Buffer.from(base64Data, 'base64'), contentType, extension };
  }
  return null;
}

// ==========================================
// 3. LOGISTIC ENGINE: PROCESS PING (GPS + PHOTO)
// ==========================================
export type ProcessLocationPingInput = {
  emp_number: string;
  action_type: 'CHECK_IN' | 'CHECK_OUT';
  device_time: string;
  latitude: number;
  longitude: number;
  sync_type: string;
  photo_url?: string;
  photo_base64?: string;
  shift_id?: string;
  nfc_tag?: string;
  checkout_flag?: 'EARLY' | 'NORMAL';
};

export async function processLocationPing(payload: ProcessLocationPingInput) {
  const supabase = createSupabaseServiceClient();
  let photo_url = payload.photo_url;

  const openCheckIn = await findOpenCheckIn(supabase, payload.emp_number);
  const employee = await findActiveEmployeeByRosterKey(supabase, payload.emp_number);
  if (!employee) {
    return { success: false, error: 'No active shift scheduled for today.' };
  }

  if (payload.action_type === 'CHECK_OUT' && !openCheckIn) {
    return { success: false, error: 'No open check-in found for this shift.' };
  }

  if (payload.action_type === 'CHECK_IN' && openCheckIn) {
    return { success: false, error: 'You are already checked in. Check out first.' };
  }

  const shift =
    payload.action_type === 'CHECK_OUT' && openCheckIn
      ? await resolveShiftAtCheckInTime(
          supabase,
          employee,
          new Date(openCheckIn.device_time),
        )
      : (await resolveActiveShiftForToday(supabase, payload.emp_number))?.shift ?? null;

  if (!shift) {
    return { success: false, error: 'No active shift scheduled for today.' };
  }
  const verificationMode = shift.verificationMode;
  const startTimes = await fetchSecurityShiftTiming(supabase, employee.company_id);
  const window = applyMdSettingsShiftWindow(shift.shiftDate, shift.shiftType, startTimes);
  const plannedEndTime = window?.plannedEndTime ?? shift.plannedEndTime;

  if (verificationMode === 'A') {
    return { success: false, error: 'This site uses roster-only verification. Contact your sector manager.' };
  }

  if (verificationMode === 'C') {
    const scanned = payload.nfc_tag?.trim();
    if (!scanned) {
      return { success: false, error: 'NFC tag scan required for this site.' };
    }
    const tagMatches =
      (shift.nfcTagId && scanned === shift.nfcTagId) ||
      scanned === shift.siteName;
    if (!tagMatches) {
      return { success: false, error: 'NFC tag does not match your scheduled site.' };
    }
  } else if (shift.siteLat !== null && shift.siteLng !== null) {
    const distance = getDistanceInMeters(
      payload.latitude,
      payload.longitude,
      shift.siteLat,
      shift.siteLng,
    );
    if (distance > shift.geofenceRadius) {
      return {
        success: false,
        error: `You are ${distance}m from site (max ${shift.geofenceRadius}m).`,
      };
    }
  }

  if (payload.action_type === 'CHECK_OUT') {
    const windowStart = checkoutWindowStart(plannedEndTime);
    const windowEnd = checkoutWindowEnd(plannedEndTime);
    const deviceDate = new Date(payload.device_time);

    if (deviceDate > windowEnd) {
      await maybeAutoCheckoutGuard(supabase, payload.emp_number, deviceDate);
      return {
        success: false,
        error: 'CHECKOUT_WINDOW_CLOSED',
        checkoutClosesAt: windowEnd.toISOString(),
      };
    }

    if (deviceDate < windowStart && payload.checkout_flag !== 'EARLY') {
      return {
        success: false,
        error: 'EARLY_CHECKOUT',
        checkoutOpensAt: windowStart.toISOString(),
      };
    }
  }

  // Handle Selfie Upload if provided
  if (payload.photo_base64?.trim()) {
    const decoded = decodeBase64Image(payload.photo_base64);
    if (decoded) {
      const safeEmp = payload.emp_number.replace(/[^a-zA-Z0-9_-]/g, '_');
      const objectPath = `${safeEmp}-${payload.action_type}-${Date.now()}.${decoded.extension}`;

      const { error: uploadError } = await supabase.storage
        .from('attendance_selfies')
        .upload(objectPath, decoded.buffer, { contentType: decoded.contentType });

      if (!uploadError) {
        const { data } = supabase.storage.from('attendance_selfies').getPublicUrl(objectPath);
        photo_url = data.publicUrl;
      }
    }
  }

  const logStatus = resolveLogStatus(
    payload.action_type,
    payload.device_time,
    plannedEndTime,
    payload.checkout_flag,
  );

  const row = {
    emp_number: payload.emp_number,
    action_type: payload.action_type,
    device_time: payload.device_time,
    latitude: payload.latitude,
    longitude: payload.longitude,
    sync_type: payload.sync_type,
    photo_url,
    status: logStatus,
    company_id: employee.company_id,
  };

  const { error } = await supabase.from('attendance_logs').insert([row]);
  if (error) return { success: false, error: error.message };

  revalidatePath('/');
  return {
    success: true,
    status: logStatus,
    flagged: logStatus === 'FLAGGED',
  };
}

// ==========================================
// 5. ROSTER: UPCOMING SHIFTS
// ==========================================
export type UpcomingShift = {
  id: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  siteName: string;
};

export async function getUpcomingShifts(empNumber: string): Promise<UpcomingShift[]> {
  try {
    const supabase = createSupabaseServiceClient();
    const rows = await resolveUpcomingShifts(supabase, empNumber, 14);

    return rows.map((shift) => ({
      id: shift.shiftId,
      shiftDate: shift.shiftDate,
      startTime: shift.plannedStartTime,
      endTime: shift.plannedEndTime,
      siteName: shift.siteName,
    }));
  } catch (err) {
    console.error('❌ UPCOMING SHIFTS ERROR:', err);
    return [];
  }
}