'use server';

import { unstable_noStore as noStore } from 'next/cache';
import { revalidatePath } from 'next/cache';

import { getCafeLogoUrl } from '../../../../packages/supabase/cafe-branding';
import { getCompanyLogoUrl } from '../../../../packages/supabase/company-branding';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../packages/supabase/service';
import {
  cafeEmployeeEpfKey,
  cafeFrontAuthEmail,
  findCafeEmployeeByEpf,
  getCafePortalAuthRecord,
  isCafeOtpValid,
  isCafeEmployee,
  isEmployeeActive,
  employeeRosterKey,
  normalizeEpfNo,
  resolveCafeEmployeeForUser,
  type CafeEmployeeRow,
} from '../../lib/cafe-front-auth';
import {
  formatPortalGraceEndTime,
  isAfterCafeClose,
  isAfterPortalGraceEnd,
  loadCafeOpenHours,
  resolveCafeSiteGeofence,
  validateCafeCheckinLocation,
  validateCafeCheckinWindow,
} from '../../lib/cafe-front-checkin';
import { getCafeShiftGate, type CafeShiftGate } from '../../lib/cafe-front-shift';
import {
  computeCafeShiftWindows,
  type CafeShiftWindows,
} from '../../lib/cafe-shift-hours';
import { resolveCompanyIdForSession } from '../../lib/company-context-server';
import { DEFAULT_GEOFENCE_RADIUS_M } from '../../lib/site-geofence';
import {
  getCafeDashboard,
  type CafeDashboardPayload,
  type CafeTask,
} from '../executive/cafe/actions';
import { normalizePeriodMonth } from '../executive/cafe/period-month';
import { buildRollingWindow } from '../hr/cafe-roster/utils';
import { auditStaffAction } from '../../lib/staff-audit';

export type CafeFrontSession = {
  employee: CafeEmployeeRow;
  shiftGate: CafeShiftGate;
};

export type CafeFrontOrder = {
  id: string;
  queueNumber: number;
  fulfillmentType: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress?: string;
  items: Array<{ menuItemId?: string; name: string; qty: number; unitPriceLkr: number }>;
  totalLkr: number;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  placedAt: string;
  paymentReceivedAt?: string;
  acceptedByName?: string;
  acceptedAt?: string;
  readyAt?: string;
  prepSeconds?: number;
};

export type CafePrepAvgStat = {
  menuItemId: string | null;
  menuItemName: string;
  employeeId: string;
  employeeName: string;
  avgPrepSeconds: number;
  sampleCount: number;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function auditCafeFrontAction(
  session: CafeFrontSession,
  companyId: string,
  action: string,
  targetEntity?: string,
  details?: Record<string, unknown>,
) {
  const epf =
    session.employee.epf_no ??
    session.employee.epf_num ??
    session.employee.emp_number ??
    '';
  await auditStaffAction({
    portal: 'cafe-front',
    action,
    targetEntity,
    details,
    companyId,
    profileId: session.employee.id,
    actorName: session.employee.full_name ?? (epf || 'Café Staff'),
    actorRole: session.employee.rank ?? 'Barista',
  });
}

async function resolveCafeCompanyId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  return resolveCompanyIdForSession(supabase);
}

function decodeBase64Image(base64: string): { buffer: Buffer; contentType: string; extension: string } | null {
  const match = base64.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
  if (!match) return null;
  const contentType = match[1];
  const extension = contentType.includes('png') ? 'png' : 'jpg';
  return { buffer: Buffer.from(match[2], 'base64'), contentType, extension };
}

async function requireCafeSession(): Promise<CafeFrontSession | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const employee = await resolveCafeEmployeeForUser(user);
  if (!employee) return null;

  const shiftGate = await getCafeShiftGate(employee);
  return { employee, shiftGate };
}

async function requireCafeCheckedIn(): Promise<
  { session: CafeFrontSession } | { session: null; error: string }
> {
  const session = await requireCafeSession();
  if (!session) return { session: null, error: 'Not signed in.' };
  if (!session.shiftGate.portalAccessible) {
    if (session.shiftGate.activeOnShift) {
      return {
        session: null,
        error: `Portal closed after ${session.shiftGate.portalGraceEnd}. Check out to end your shift.`,
      };
    }
    return { session: null, error: 'Shift check-in required before using the café portal.' };
  }
  return { session };
}

export type CafeShiftCheckinContext = {
  rosteredToday: boolean;
  checkedInToday: boolean;
  checkedOutToday: boolean;
  activeOnShift: boolean;
  checkinAt: string | null;
  checkoutAt: string | null;
  shiftType: string | null;
  siteName: string | null;
  siteLat: number | null;
  siteLng: number | null;
  geofenceRadiusM: number;
  cafeOpenStart: string;
  cafeOpenEnd: string;
  withinOpenHours: boolean;
  afterClose: boolean;
  afterPortalGrace: boolean;
  portalAccessible: boolean;
  portalGraceEnd: string;
  canCheckIn: boolean;
  canCheckOut: boolean;
  shiftWindows: CafeShiftWindows;
};

export async function getCafeShiftCheckinContext(): Promise<CafeShiftCheckinContext | null> {
  noStore();
  const session = await requireCafeSession();
  if (!session) return null;

  const companyId = await resolveCafeCompanyId();
  if (!companyId) return null;

  const supabase = createSupabaseServiceClient();
  const [site, openHours] = await Promise.all([
    resolveCafeSiteGeofence(supabase, companyId, session.employee.site),
    loadCafeOpenHours(supabase, companyId),
  ]);

  const withinOpenHours = validateCafeCheckinWindow(
    openHours.openStart,
    openHours.openEnd,
  ).ok;
  const afterClose = isAfterCafeClose(openHours.openEnd);
  const afterPortalGrace = isAfterPortalGraceEnd(openHours.openEnd);
  const portalGraceEnd = formatPortalGraceEndTime(openHours.openEnd);
  const shiftWindows = computeCafeShiftWindows(openHours.openStart, openHours.openEnd);
  const canCheckIn = !session.shiftGate.checkedInToday && withinOpenHours;
  const canCheckOut = session.shiftGate.activeOnShift;
  const portalAccessible = session.shiftGate.portalAccessible;

  return {
    rosteredToday: session.shiftGate.rosteredToday,
    checkedInToday: session.shiftGate.checkedInToday,
    checkedOutToday: session.shiftGate.checkedOutToday,
    activeOnShift: session.shiftGate.activeOnShift,
    checkinAt: session.shiftGate.checkinAt,
    checkoutAt: session.shiftGate.checkoutAt,
    shiftType: session.shiftGate.shiftType,
    siteName: site?.siteName ?? null,
    siteLat: site?.siteLat ?? null,
    siteLng: site?.siteLng ?? null,
    geofenceRadiusM: site?.geofenceRadiusM ?? DEFAULT_GEOFENCE_RADIUS_M,
    cafeOpenStart: openHours.openStart,
    cafeOpenEnd: openHours.openEnd,
    withinOpenHours,
    afterClose,
    afterPortalGrace,
    portalAccessible,
    portalGraceEnd,
    canCheckIn,
    canCheckOut,
    shiftWindows,
  };
}

export async function authenticateCafeFrontStaff(formData: FormData) {
  const epfInput = normalizeEpfNo((formData.get('epfNo') as string) ?? '');
  const password = ((formData.get('password') as string) ?? '').trim();

  if (!epfInput) return { success: false, error: 'EPF number is required.' };
  if (!password) return { success: false, error: 'PIN or OTP is required.' };

  const service = createSupabaseServiceClient();
  const employee = await findCafeEmployeeByEpf(service, epfInput);

  if (!employee) {
    return { success: false, error: 'EPF number not found on the master nominal roll.' };
  }
  if (!isEmployeeActive(employee)) {
    return { success: false, error: 'This employee is not active.' };
  }
  if (!isCafeEmployee(employee)) {
    return { success: false, error: 'This portal is for Café operations staff only.' };
  }

  const epf = cafeEmployeeEpfKey(employee) || epfInput;
  const authRecord = await getCafePortalAuthRecord(service, epf);
  if (!authRecord || !authRecord.is_active) {
    return { success: false, error: 'Portal access not provisioned. Contact HR.' };
  }

  if (authRecord.needs_pin_setup) {
    if (!authRecord.current_otp || password !== authRecord.current_otp) {
      return { success: false, error: 'Invalid OTP.' };
    }
    if (!isCafeOtpValid(authRecord)) {
      return { success: false, error: 'OTP expired. Ask HR for a new one.' };
    }
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: cafeFrontAuthEmail(epf),
    password,
  });

  if (error) {
    return { success: false, error: 'Invalid credentials.' };
  }

  await service
    .from('cafe_portal_auth')
    .update({ last_login_at: new Date().toISOString() })
    .eq('epf_number', epf);

  return {
    success: true,
    needsPinSetup: authRecord.needs_pin_setup,
    staffName: employee.full_name ?? epf,
  };
}

export async function getCafeFrontSession(): Promise<CafeFrontSession | null> {
  noStore();
  return requireCafeSession();
}

export async function getCafeFrontBranding(): Promise<{
  cafeLogoUrl: string | null;
  companyLogoUrl: string | null;
}> {
  noStore();
  const session = await requireCafeSession();
  if (!session) return { cafeLogoUrl: null, companyLogoUrl: null };

  const companyId = await resolveCafeCompanyId();
  const [cafeLogoUrl, companyLogoUrl] = await Promise.all([
    getCafeLogoUrl(),
    getCompanyLogoUrl(companyId),
  ]);
  return { cafeLogoUrl, companyLogoUrl };
}

export type CafeFrontRollingSchedule = {
  days: string[];
  shifts: Array<{ shift_date: string; shift_type: string }>;
  leaveDates: string[];
  shiftWindows: CafeShiftWindows;
};

export async function getCafeFrontRollingSchedule(): Promise<CafeFrontRollingSchedule | null> {
  noStore();
  const session = await requireCafeSession();
  if (!session) return null;

  const companyId = await resolveCafeCompanyId();
  if (!companyId) return null;

  const supabase = createSupabaseServiceClient();
  const { days } = buildRollingWindow();
  const start = days[0];
  const end = days[days.length - 1];

  const [openHours, shiftsResult, leaveResult] = await Promise.all([
    loadCafeOpenHours(supabase, companyId),
    supabase
      .from('rostered_shifts')
      .select('shift_date, shift_type')
      .eq('company_id', companyId)
      .eq('guard_id', session.employee.id)
      .gte('shift_date', start)
      .lte('shift_date', end),
    supabase
      .from('cafe_leave_requests')
      .select('leave_date, status')
      .eq('employee_id', session.employee.id)
      .gte('leave_date', start)
      .lte('leave_date', end),
  ]);

  return {
    days,
    shifts: shiftsResult.data ?? [],
    leaveDates: (leaveResult.data ?? [])
      .filter((row) => row.status === 'PENDING' || row.status === 'APPROVED')
      .map((row) => row.leave_date as string),
    shiftWindows: computeCafeShiftWindows(openHours.openStart, openHours.openEnd),
  };
}

export async function getCafeFrontDashboard(): Promise<CafeDashboardPayload> {
  noStore();
  return getCafeDashboard();
}

export type CafeFrontTask = CafeTask & { proofUrl?: string };

export async function getCafeFrontTasks(date?: string): Promise<CafeFrontTask[]> {
  noStore();
  const checked = await requireCafeCheckedIn();
  if (!checked.session) return [];
  const session = checked.session;

  const payload = await getCafeDashboard();
  const targetDate = date ?? todayIso();
  const supabase = createSupabaseServiceClient();
  const companyId = await resolveCafeCompanyId();
  if (!companyId) return payload.tasks;

  const { data: templates } = await supabase
    .from('cafe_task_templates')
    .select('id, name, freq, assigned_name, due_time')
    .eq('company_id', companyId)
    .eq('active', true);

  if (!templates?.length) return [];

  const templateIds = templates.map((t) => t.id);
  const { data: completions } = await supabase
    .from('cafe_task_completions')
    .select('template_id, status, proof_uploaded_at, proof_url, purge_after')
    .in('template_id', templateIds)
    .eq('completion_date', targetDate);

  const completionByTemplate = new Map(
    (completions ?? []).map((c) => [c.template_id, c]),
  );

  return templates.map((t) => {
    const completion = completionByTemplate.get(t.id);
    const dueTimeRaw = t.due_time as string | null | undefined;
    return {
      id: t.id,
      name: t.name,
      freq: t.freq as CafeTask['freq'],
      assignedTo: t.assigned_name ?? '',
      dueTime: dueTimeRaw ? dueTimeRaw.slice(0, 5) : undefined,
      status: (completion?.status as CafeTask['status']) ?? 'PENDING',
      proofUploadedAt: completion?.proof_uploaded_at ?? undefined,
      purgeDate: completion?.purge_after ?? undefined,
      proofUrl: (completion?.proof_url as string | undefined) ?? undefined,
    };
  });
}

export async function uploadCafeTaskProof(input: {
  taskId: string;
  photoBase64: string;
  completionDate?: string;
}): Promise<{ ok: boolean; error?: string; proofUrl?: string }> {
  noStore();
  const checked = await requireCafeCheckedIn();
  if (!checked.session) return { ok: false, error: checked.error };

  const companyId = await resolveCafeCompanyId();
  if (!companyId) return { ok: false, error: 'No company context.' };

  const decoded = decodeBase64Image(input.photoBase64);
  if (!decoded) return { ok: false, error: 'Invalid photo capture.' };

  const service = createSupabaseServiceClient();
  const session = checked.session;
  const objectPath = `cafe-task-proof/${session.employee.id}/${input.taskId}-${Date.now()}.${decoded.extension}`;
  const { error: uploadError } = await service.storage
    .from('attendance_selfies')
    .upload(objectPath, decoded.buffer, { contentType: decoded.contentType });

  if (uploadError) return { ok: false, error: uploadError.message };

  const { data: urlData } = service.storage.from('attendance_selfies').getPublicUrl(objectPath);
  const proofUrl = urlData.publicUrl;
  const completionDate = input.completionDate ?? todayIso();
  const purgeAfter = new Date();
  purgeAfter.setDate(purgeAfter.getDate() + 14);

  const { error } = await service.from('cafe_task_completions').upsert(
    {
      template_id: input.taskId,
      completion_date: completionDate,
      status: 'COMPLETE',
      proof_uploaded_at: completionDate,
      proof_url: proofUrl,
      purge_after: purgeAfter.toISOString().slice(0, 10),
    },
    { onConflict: 'template_id,completion_date' },
  );

  if (error) return { ok: false, error: error.message };

  await auditCafeFrontAction(session, companyId, 'Upload Task Proof', `Task ${input.taskId}`, {
    taskId: input.taskId,
    completionDate,
  });

  revalidatePath('/cafe-front');
  return { ok: true, proofUrl };
}

export async function submitCafeShiftCheckin(input: {
  photoBase64: string;
  latitude: number;
  longitude: number;
  shiftType?: string;
}): Promise<{ ok: boolean; error?: string }> {
  noStore();
  const session = await requireCafeSession();
  if (!session) return { ok: false, error: 'Not signed in.' };
  if (session.shiftGate.checkedInToday) {
    return { ok: false, error: 'You have already checked in today.' };
  }

  const companyId = await resolveCafeCompanyId();
  if (!companyId) return { ok: false, error: 'No company context.' };

  const supabase = createSupabaseServiceClient();
  const [site, openHours] = await Promise.all([
    resolveCafeSiteGeofence(supabase, companyId, session.employee.site),
    loadCafeOpenHours(supabase, companyId),
  ]);

  const hoursCheck = validateCafeCheckinWindow(openHours.openStart, openHours.openEnd);
  if (!hoursCheck.ok) return { ok: false, error: hoursCheck.error };

  const locationCheck = validateCafeCheckinLocation(input.latitude, input.longitude, site);
  if (!locationCheck.ok) return { ok: false, error: locationCheck.error };

  const decoded = decodeBase64Image(input.photoBase64);
  if (!decoded) return { ok: false, error: 'Selfie capture required.' };

  const objectPath = `cafe-checkin/${session.employee.id}/${Date.now()}.${decoded.extension}`;
  const { error: uploadError } = await supabase.storage
    .from('attendance_selfies')
    .upload(objectPath, decoded.buffer, { contentType: decoded.contentType });

  if (uploadError) return { ok: false, error: uploadError.message };

  const { data: urlData } = supabase.storage.from('attendance_selfies').getPublicUrl(objectPath);
  const shiftType = input.shiftType ?? session.shiftGate.shiftType ?? 'MORNING';

  const checkedInAt = new Date().toISOString();
  const rosteredOnShift = session.shiftGate.rosteredToday;

  const { error } = await supabase.from('cafe_staff_checkins').insert({
    company_id: companyId,
    employee_id: session.employee.id,
    checkin_date: todayIso(),
    shift_type: shiftType,
    latitude: input.latitude,
    longitude: input.longitude,
    selfie_url: urlData.publicUrl,
    checked_in_at: checkedInAt,
    verification_status: 'PENDING',
    rostered_on_shift: rosteredOnShift,
  });

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'You have already checked in today.' };
    }
    return { ok: false, error: error.message };
  }

  const empKey = employeeRosterKey(session.employee);
  if (empKey) {
    await supabase.from('attendance_logs').insert({
      company_id: companyId,
      emp_number: empKey,
      action_type: 'CHECK_IN',
      device_time: checkedInAt,
      latitude: input.latitude,
      longitude: input.longitude,
      sync_type: 'CAFE_FRONT',
      photo_url: urlData.publicUrl,
      status: 'PENDING',
    });
  }

  await auditCafeFrontAction(session, companyId, 'Shift Check-in', session.employee.full_name ?? session.employee.id, {
    shiftType,
    latitude: input.latitude,
    longitude: input.longitude,
    rosteredOnShift,
    verificationStatus: 'PENDING',
  });

  revalidatePath('/cafe-front');
  return { ok: true };
}

export async function submitCafeShiftCheckout(input: {
  photoBase64: string;
  latitude: number;
  longitude: number;
}): Promise<{ ok: boolean; error?: string }> {
  noStore();
  const session = await requireCafeSession();
  if (!session) return { ok: false, error: 'Not signed in.' };
  if (!session.shiftGate.checkedInToday) {
    return { ok: false, error: 'Check in before checking out.' };
  }
  if (session.shiftGate.checkedOutToday) {
    return { ok: false, error: 'You have already checked out today.' };
  }

  const companyId = await resolveCafeCompanyId();
  if (!companyId) return { ok: false, error: 'No company context.' };

  const supabase = createSupabaseServiceClient();
  const site = await resolveCafeSiteGeofence(supabase, companyId, session.employee.site);

  const locationCheck = validateCafeCheckinLocation(input.latitude, input.longitude, site);
  if (!locationCheck.ok) return { ok: false, error: locationCheck.error };

  const decoded = decodeBase64Image(input.photoBase64);
  if (!decoded) return { ok: false, error: 'Selfie capture required to check out.' };

  const objectPath = `cafe-checkout/${session.employee.id}/${Date.now()}.${decoded.extension}`;
  const { error: uploadError } = await supabase.storage
    .from('attendance_selfies')
    .upload(objectPath, decoded.buffer, { contentType: decoded.contentType });

  if (uploadError) return { ok: false, error: uploadError.message };

  const { data: urlData } = supabase.storage.from('attendance_selfies').getPublicUrl(objectPath);
  const checkedOutAt = new Date().toISOString();

  const { error } = await supabase
    .from('cafe_staff_checkins')
    .update({
      checked_out_at: checkedOutAt,
      checkout_latitude: input.latitude,
      checkout_longitude: input.longitude,
      checkout_selfie_url: urlData.publicUrl,
    })
    .eq('company_id', companyId)
    .eq('employee_id', session.employee.id)
    .eq('checkin_date', todayIso());

  if (error) return { ok: false, error: error.message };

  const empKey = employeeRosterKey(session.employee);
  if (empKey) {
    await supabase.from('attendance_logs').insert({
      company_id: companyId,
      emp_number: empKey,
      action_type: 'CHECK_OUT',
      device_time: checkedOutAt,
      latitude: input.latitude,
      longitude: input.longitude,
      sync_type: 'CAFE_FRONT',
      photo_url: urlData.publicUrl,
      status: 'PENDING',
    });
  }

  await auditCafeFrontAction(
    session,
    companyId,
    'Shift Check-out',
    session.employee.full_name ?? session.employee.id,
    {
      shiftType: session.shiftGate.shiftType,
      latitude: input.latitude,
      longitude: input.longitude,
    },
  );

  revalidatePath('/cafe-front');
  return { ok: true };
}

export async function requestCafeLeave(input: {
  leaveDate: string;
  reason: string;
}): Promise<{ ok: boolean; error?: string }> {
  noStore();
  const checked = await requireCafeCheckedIn();
  if (!checked.session) return { ok: false, error: checked.error };

  const companyId = await resolveCafeCompanyId();
  if (!companyId) return { ok: false, error: 'No company context.' };

  const supabase = createSupabaseServiceClient();
  const session = checked.session;
  const { error } = await supabase.from('cafe_leave_requests').upsert(
    {
      company_id: companyId,
      employee_id: session.employee.id,
      leave_date: input.leaveDate,
      reason: input.reason.trim(),
      status: 'PENDING',
      requested_at: new Date().toISOString(),
    },
    { onConflict: 'employee_id,leave_date' },
  );

  if (error) return { ok: false, error: error.message };

  await auditCafeFrontAction(checked.session, companyId, 'Request Leave', input.leaveDate, {
    leaveDate: input.leaveDate,
    reason: input.reason.trim(),
  });

  revalidatePath('/cafe-front/roster');
  return { ok: true };
}

export async function submitCafeMenuRequest(input: {
  requestType: 'CHANGE_ITEM' | 'ADD_ITEM';
  menuItemId?: string;
  payload: Record<string, unknown>;
  availableUntil?: string;
  permanent?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  noStore();
  const checked = await requireCafeCheckedIn();
  if (!checked.session) return { ok: false, error: checked.error };

  const companyId = await resolveCafeCompanyId();
  if (!companyId) return { ok: false, error: 'No company context.' };

  const supabase = createSupabaseServiceClient();
  const session = checked.session;
  const { error } = await supabase.from('cafe_menu_change_requests').insert({
    company_id: companyId,
    requested_by_employee_id: session.employee.id,
    request_type: input.requestType,
    menu_item_id: input.menuItemId ?? null,
    payload: input.payload,
    available_until: input.availableUntil ?? null,
    permanent: input.permanent ?? false,
    status: 'PENDING',
  });

  if (error) return { ok: false, error: error.message };

  await auditCafeFrontAction(checked.session, companyId, 'Menu Change Request', input.requestType, {
    requestType: input.requestType,
    menuItemId: input.menuItemId ?? null,
  });

  revalidatePath('/cafe-front/menu');
  return { ok: true };
}

export async function getCafeFrontOrders(): Promise<CafeFrontOrder[]> {
  noStore();
  const checked = await requireCafeCheckedIn();
  if (!checked.session) return [];

  const companyId = await resolveCafeCompanyId();
  if (!companyId) return [];

  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from('cafe_customer_orders')
    .select(
      'id, queue_number, fulfillment_type, customer_name, customer_phone, delivery_address, items, total_lkr, status, payment_method, payment_status, placed_at, payment_received_at, accepted_by_employee_id, accepted_at, ready_at, prep_seconds',
    )
    .eq('company_id', companyId)
    .in('status', ['PLACED', 'PAYMENT_RECEIVED', 'PREPARING', 'READY'])
    .order('placed_at', { ascending: true });

  const acceptedIds = [
    ...new Set(
      (data ?? [])
        .map((row) => row.accepted_by_employee_id)
        .filter((id): id is string => typeof id === 'string'),
    ),
  ];

  const nameById = new Map<string, string>();
  if (acceptedIds.length) {
    const { data: employees } = await supabase
      .from('employees')
      .select('id, full_name')
      .in('id', acceptedIds);
    for (const emp of employees ?? []) {
      nameById.set(emp.id, emp.full_name ?? 'Staff');
    }
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    queueNumber: row.queue_number,
    fulfillmentType: row.fulfillment_type,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    deliveryAddress: row.delivery_address ?? undefined,
    items: (row.items as CafeFrontOrder['items']) ?? [],
    totalLkr: Number(row.total_lkr) || 0,
    status: row.status,
    paymentMethod: row.payment_method ?? 'card_online',
    paymentStatus: row.payment_status ?? 'pending',
    placedAt: row.placed_at,
    paymentReceivedAt: row.payment_received_at ?? undefined,
    acceptedByName: row.accepted_by_employee_id
      ? nameById.get(row.accepted_by_employee_id)
      : undefined,
    acceptedAt: row.accepted_at ?? undefined,
    readyAt: row.ready_at ?? undefined,
    prepSeconds: row.prep_seconds ?? undefined,
  }));
}

export async function updateCafeOrderStatus(
  orderId: string,
  action: 'payment_received' | 'start_prep' | 'mark_ready' | 'complete',
): Promise<{ ok: boolean; error?: string }> {
  noStore();
  const session = await requireCafeSession();
  if (!session) return { ok: false, error: 'Not signed in.' };

  if (!session.shiftGate.canAcceptOrders) {
    return {
      ok: false,
      error: 'Shift check-in required — GPS + selfie at the café site before accepting orders.',
    };
  }

  const companyId = await resolveCafeCompanyId();
  if (!companyId) return { ok: false, error: 'No company context.' };

  const supabase = createSupabaseServiceClient();
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from('cafe_customer_orders')
    .select('status, accepted_at, items')
    .eq('id', orderId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!existing) return { ok: false, error: 'Order not found.' };

  const patch: Record<string, unknown> = {};

  if (action === 'payment_received') {
    if (existing.status !== 'PLACED') return { ok: false, error: 'Order is not awaiting payment.' };
    patch.status = 'PAYMENT_RECEIVED';
    patch.payment_received_at = now;
  }

  if (action === 'start_prep') {
    if (!['PLACED', 'PAYMENT_RECEIVED'].includes(existing.status)) {
      return { ok: false, error: 'Order cannot be started.' };
    }
    patch.status = 'PREPARING';
    patch.accepted_by_employee_id = session.employee.id;
    patch.accepted_at = now;
    if (existing.status === 'PLACED') patch.payment_received_at = now;
  }

  if (action === 'mark_ready') {
    if (existing.status !== 'PREPARING') return { ok: false, error: 'Order is not in preparation.' };
    patch.status = 'READY';
    patch.ready_at = now;
    const acceptedAt = existing.accepted_at ? new Date(existing.accepted_at).getTime() : Date.now();
    const prepSeconds = Math.max(0, Math.round((Date.now() - acceptedAt) / 1000));
    patch.prep_seconds = prepSeconds;

    const items = (existing.items as CafeFrontOrder['items']) ?? [];
    const stats = items.map((item) => ({
      company_id: companyId,
      menu_item_id: item.menuItemId ?? null,
      menu_item_name: item.name,
      employee_id: session.employee.id,
      order_id: orderId,
      prep_seconds: Math.round(prepSeconds / Math.max(items.length, 1)),
    }));
    if (stats.length) {
      await supabase.from('cafe_order_prep_stats').insert(stats);
    }
  }

  if (action === 'complete') {
    if (!['READY', 'PREPARING'].includes(existing.status)) {
      return { ok: false, error: 'Order cannot be completed.' };
    }
    patch.status = 'COMPLETED';
    patch.completed_at = now;
  }

  const { error } = await supabase
    .from('cafe_customer_orders')
    .update(patch)
    .eq('id', orderId);

  if (error) return { ok: false, error: error.message };

  const actionLabels: Record<typeof action, string> = {
    payment_received: 'Order Payment Received',
    start_prep: 'Start Order Prep',
    mark_ready: 'Mark Order Ready',
    complete: 'Complete Order',
  };

  await auditCafeFrontAction(session, companyId, actionLabels[action], `Order ${orderId}`, {
    orderId,
    action,
  });

  revalidatePath('/cafe-front/orders');
  return { ok: true };
}

export async function getCafePrepAvgStats(): Promise<CafePrepAvgStat[]> {
  noStore();
  const companyId = await resolveCafeCompanyId();
  if (!companyId) return [];

  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from('cafe_order_prep_stats')
    .select('menu_item_id, menu_item_name, employee_id, prep_seconds')
    .eq('company_id', companyId)
    .gte('recorded_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  const buckets = new Map<string, CafePrepAvgStat & { total: number }>();
  const employeeIds = new Set<string>();

  for (const row of data ?? []) {
    employeeIds.add(row.employee_id);
    const key = `${row.menu_item_id ?? 'unknown'}:${row.employee_id}`;
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, {
        menuItemId: row.menu_item_id,
        menuItemName: row.menu_item_name,
        employeeId: row.employee_id,
        employeeName: '',
        avgPrepSeconds: 0,
        sampleCount: 0,
        total: 0,
      });
    }
    const bucket = buckets.get(key)!;
    bucket.total += row.prep_seconds;
    bucket.sampleCount += 1;
    bucket.avgPrepSeconds = Math.round(bucket.total / bucket.sampleCount);
  }

  const { data: employees } = await supabase
    .from('employees')
    .select('id, full_name')
    .in('id', [...employeeIds]);

  const nameById = new Map((employees ?? []).map((e) => [e.id, e.full_name ?? 'Staff']));

  return [...buckets.values()].map(({ total: _total, ...stat }) => ({
    ...stat,
    employeeName: nameById.get(stat.employeeId) ?? 'Staff',
  }));
}

export async function getCafeFrontRosterDays(periodMonth?: string) {
  noStore();
  const checked = await requireCafeCheckedIn();
  if (!checked.session) return { shifts: [], leaveDates: [] as string[] };
  const session = checked.session;

  const companyId = await resolveCafeCompanyId();
  if (!companyId) return { shifts: [], leaveDates: [] as string[] };

  const month = normalizePeriodMonth(periodMonth);
  const supabase = createSupabaseServiceClient();

  const start = `${month}-01`;
  const endDate = new Date(`${month}-01T00:00:00`);
  endDate.setMonth(endDate.getMonth() + 1);
  endDate.setDate(0);
  const end = endDate.toISOString().slice(0, 10);

  const { data: shifts } = await supabase
    .from('rostered_shifts')
    .select('shift_date, shift_type')
    .eq('company_id', companyId)
    .eq('guard_id', session.employee.id)
    .gte('shift_date', start)
    .lte('shift_date', end);

  const { data: leave } = await supabase
    .from('cafe_leave_requests')
    .select('leave_date, status')
    .eq('employee_id', session.employee.id)
    .gte('leave_date', start)
    .lte('leave_date', end);

  return {
    shifts: shifts ?? [],
    leaveDates: (leave ?? [])
      .filter((row) => row.status === 'PENDING' || row.status === 'APPROVED')
      .map((row) => row.leave_date as string),
  };
}
