'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../packages/supabase/server';
import { getDistanceInMeters } from '../lib/geofence';

type VerificationMode = 'A' | 'B' | 'C';

type SiteProfileRow = Record<string, unknown> & {
  site_name?: string;
};

function toNumberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickCoord(row: SiteProfileRow, keys: string[]): number | null {
  for (const key of keys) {
    if (key in row) {
      const parsed = toNumberOrNull(row[key]);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

function parseSiteProfile(raw: SiteProfileRow | SiteProfileRow[] | null | undefined) {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row) {
    return {
      siteName: 'UNKNOWN SITE',
      siteLat: null as number | null,
      siteLng: null as number | null,
      geofenceRadius: 25,
      verificationMode: 'B' as VerificationMode,
      nfcTagId: null as string | null,
    };
  }

  const mode = String(row.verification_mode ?? 'B').toUpperCase();
  const verificationMode: VerificationMode =
    mode === 'A' || mode === 'C' ? mode : 'B';

  return {
    siteName: String(row.site_name ?? 'UNKNOWN SITE'),
    siteLat: pickCoord(row, ['latitude', 'lat', 'site_lat', 'site_latitude']),
    siteLng: pickCoord(row, ['longitude', 'lng', 'site_lng', 'site_longitude']),
    geofenceRadius:
      pickCoord(row, ['geofence_radius', 'radius_meters', 'gps_radius_meters']) ?? 25,
    verificationMode,
    nfcTagId: row.nfc_tag_id ? String(row.nfc_tag_id) : null,
  };
}

function checkoutWindowStart(endTimeIso: string): Date {
  return new Date(new Date(endTimeIso).getTime() - 30 * 60 * 1000);
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
  if (deviceDate < windowStart) return 'FLAGGED';

  return 'PENDING';
}

// ==========================================
// 1. TIME ENGINE: SHIFT STATE CHECKER
// ==========================================
export async function getGuardAttendanceState(empNumber: string) {
  try {
    const supabase = await createSupabaseServerClient();
    
    // A. Find the Guard's profile
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id, full_name')
      .eq('emp_number', empNumber)
      .eq('status', 'ACTIVE')
      .single();

    if (empError || !employee) {
      return { status: 'ERROR', message: 'GUARD PROFILE NOT FOUND OR INACTIVE.' };
    }

    // B. Look for today's shift on the SM roster
    const today = new Date().toISOString().split('T')[0];

    const { data: shift, error: shiftError } = await supabase
      .from('time_rosters')
      .select(`
        id,
        planned_start_time,
        planned_end_time,
        site_profiles (
          site_name,
          latitude,
          longitude,
          lat,
          lng,
          geofence_radius,
          radius_meters,
          verification_mode,
          nfc_tag_id
        )
      `)
      .eq('employee_id', employee.id)
      .eq('shift_date', today)
      .eq('status', 'ACTIVE')
      .single();

    if (shiftError || !shift) {
      return { 
        status: 'IDLE', 
        message: 'NO ACTIVE SHIFT SCHEDULED FOR TODAY.',
        guardName: employee.full_name
      };
    }

    // C. Check last action for today
    const { data: lastLog } = await supabase
      .from('attendance_logs')
      .select('action_type, device_time')
      .eq('emp_number', empNumber)
      .gte('device_time', `${today}T00:00:00`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextAction = lastLog?.action_type === 'CHECK_IN' ? 'CHECK_OUT' : 'CHECK_IN';
    const siteInfo = parseSiteProfile(
      (shift as { site_profiles?: SiteProfileRow | SiteProfileRow[] }).site_profiles,
    );
    const checkoutOpensAt = checkoutWindowStart(shift.planned_end_time).toISOString();

    return {
      status: 'READY',
      nextAction,
      shiftId: shift.id,
      guardName: employee.full_name,
      locationName: siteInfo.siteName,
      startTime: shift.planned_start_time,
      endTime: shift.planned_end_time,
      checkoutOpensAt,
      siteLat: siteInfo.siteLat,
      siteLng: siteInfo.siteLng,
      geofenceRadius: siteInfo.geofenceRadius,
      verificationMode: siteInfo.verificationMode,
      nfcTagId: siteInfo.nfcTagId,
    };

  } catch (error: any) {
    console.error('❌ FIELD API ERROR:', error.message);
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
  const supabase = await createSupabaseServerClient();
  let photo_url = payload.photo_url;

  const today = new Date().toISOString().split('T')[0];

  const { data: employee } = await supabase
    .from('employees')
    .select('id')
    .eq('emp_number', payload.emp_number)
    .eq('status', 'ACTIVE')
    .single();

  if (!employee) {
    return { success: false, error: 'Guard profile not found.' };
  }

  const { data: shift } = await supabase
    .from('time_rosters')
    .select(`
      id,
      planned_end_time,
      site_profiles (
        site_name,
        latitude,
        longitude,
        lat,
        lng,
        geofence_radius,
        radius_meters,
        verification_mode,
        nfc_tag_id
      )
    `)
    .eq('employee_id', employee.id)
    .eq('shift_date', today)
    .eq('status', 'ACTIVE')
    .single();

  if (!shift) {
    return { success: false, error: 'No active shift scheduled for today.' };
  }

  const siteInfo = parseSiteProfile(
    (shift as { site_profiles?: SiteProfileRow | SiteProfileRow[] }).site_profiles,
  );

  const verificationMode = siteInfo.verificationMode;

  if (verificationMode === 'A') {
    return { success: false, error: 'This site uses roster-only verification. Contact your sector manager.' };
  }

  if (verificationMode === 'C') {
    const scanned = payload.nfc_tag?.trim();
    if (!scanned) {
      return { success: false, error: 'NFC tag scan required for this site.' };
    }
    const tagMatches =
      (siteInfo.nfcTagId && scanned === siteInfo.nfcTagId) ||
      scanned === siteInfo.siteName;
    if (!tagMatches) {
      return { success: false, error: 'NFC tag does not match your scheduled site.' };
    }
  } else if (siteInfo.siteLat !== null && siteInfo.siteLng !== null) {
    const distance = getDistanceInMeters(
      payload.latitude,
      payload.longitude,
      siteInfo.siteLat,
      siteInfo.siteLng,
    );
    if (distance > siteInfo.geofenceRadius) {
      return {
        success: false,
        error: `You are ${distance}m from site (max ${siteInfo.geofenceRadius}m).`,
      };
    }
  }

  if (payload.action_type === 'CHECK_OUT') {
    const windowStart = checkoutWindowStart(shift.planned_end_time);
    const deviceDate = new Date(payload.device_time);
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
    shift.planned_end_time,
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
    const supabase = await createSupabaseServerClient();

    const { data: employee } = await supabase
      .from('employees')
      .select('id')
      .eq('emp_number', empNumber)
      .eq('status', 'ACTIVE')
      .single();

    if (!employee) return [];

    const today = new Date().toISOString().split('T')[0];

    const { data: rows, error } = await supabase
      .from('time_rosters')
      .select('id, shift_date, planned_start_time, planned_end_time, site_profiles ( site_name )')
      .eq('employee_id', employee.id)
      .eq('status', 'ACTIVE')
      .gte('shift_date', today)
      .order('shift_date', { ascending: true })
      .order('planned_start_time', { ascending: true })
      .limit(14);

    if (error || !rows) return [];

    return rows.map((shift) => {
      const sp = (shift as { site_profiles?: { site_name: string } | { site_name: string }[] })
        .site_profiles;
      const siteName =
        (Array.isArray(sp) ? sp[0]?.site_name : sp?.site_name) || 'Site TBC';

      return {
        id: shift.id,
        shiftDate: shift.shift_date,
        startTime: shift.planned_start_time,
        endTime: shift.planned_end_time,
        siteName,
      };
    });
  } catch (err) {
    console.error('❌ UPCOMING SHIFTS ERROR:', err);
    return [];
  }
}