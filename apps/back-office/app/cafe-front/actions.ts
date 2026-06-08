'use server';

import { unstable_noStore as noStore } from 'next/cache';
import { revalidatePath } from 'next/cache';

import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../packages/supabase/service';
import {
  cafeFrontAuthEmail,
  cafeFrontAuthPassword,
  findCafeEmployeeByEpf,
  isCafeEmployee,
  isEmployeeActive,
  normalizeEpfNo,
  provisionCafeFrontAuth,
  resolveCafeEmployeeForUser,
  type CafeEmployeeRow,
} from '../../lib/cafe-front-auth';
import { getCafeShiftGate, type CafeShiftGate } from '../../lib/cafe-front-shift';
import { resolveCompanyIdForSession } from '../../lib/company-context';
import {
  getCafeDashboard,
  type CafeDashboardPayload,
  type CafeTask,
} from '../executive/cafe/actions';
import { normalizePeriodMonth } from '../executive/cafe/period-month';

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

export async function authenticateCafeFrontStaff(formData: FormData) {
  const epfInput = normalizeEpfNo((formData.get('epfNo') as string) ?? '');
  if (!epfInput) return { success: false, error: 'EPF number is required.' };

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

  const provision = await provisionCafeFrontAuth(service, employee);
  if (!provision.ok) {
    return { success: false, error: 'Could not provision portal access. Contact HR.' };
  }

  const epf = employee.epf_no ?? employee.epf_num ?? epfInput;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: cafeFrontAuthEmail(epf),
    password: cafeFrontAuthPassword(epf),
  });

  if (error) {
    return { success: false, error: 'Invalid EPF or portal access not provisioned. Contact HR.' };
  }

  return { success: true };
}

export async function getCafeFrontSession(): Promise<CafeFrontSession | null> {
  noStore();
  return requireCafeSession();
}

export async function getCafeFrontDashboard(): Promise<CafeDashboardPayload> {
  noStore();
  return getCafeDashboard();
}

export type CafeFrontTask = CafeTask & { proofUrl?: string };

export async function getCafeFrontTasks(date?: string): Promise<CafeFrontTask[]> {
  noStore();
  const session = await requireCafeSession();
  if (!session) return [];

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
  const session = await requireCafeSession();
  if (!session) return { ok: false, error: 'Not signed in.' };

  const companyId = await resolveCafeCompanyId();
  if (!companyId) return { ok: false, error: 'No company context.' };

  const decoded = decodeBase64Image(input.photoBase64);
  if (!decoded) return { ok: false, error: 'Invalid photo capture.' };

  const service = createSupabaseServiceClient();
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
  if (!session.shiftGate.rosteredToday) {
    return { ok: false, error: 'You are not rostered for a shift today.' };
  }

  const companyId = await resolveCafeCompanyId();
  if (!companyId) return { ok: false, error: 'No company context.' };

  const decoded = decodeBase64Image(input.photoBase64);
  if (!decoded) return { ok: false, error: 'Selfie capture required.' };

  const supabase = createSupabaseServiceClient();
  const objectPath = `cafe-checkin/${session.employee.id}/${Date.now()}.${decoded.extension}`;
  const { error: uploadError } = await supabase.storage
    .from('attendance_selfies')
    .upload(objectPath, decoded.buffer, { contentType: decoded.contentType });

  if (uploadError) return { ok: false, error: uploadError.message };

  const { data: urlData } = supabase.storage.from('attendance_selfies').getPublicUrl(objectPath);

  const { error } = await supabase.from('cafe_staff_checkins').upsert(
    {
      company_id: companyId,
      employee_id: session.employee.id,
      checkin_date: todayIso(),
      shift_type: input.shiftType ?? session.shiftGate.shiftType ?? 'CAFE',
      latitude: input.latitude,
      longitude: input.longitude,
      selfie_url: urlData.publicUrl,
      checked_in_at: new Date().toISOString(),
    },
    { onConflict: 'employee_id,checkin_date,shift_type' },
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath('/cafe-front');
  return { ok: true };
}

export async function requestCafeLeave(input: {
  leaveDate: string;
  reason: string;
}): Promise<{ ok: boolean; error?: string }> {
  noStore();
  const session = await requireCafeSession();
  if (!session) return { ok: false, error: 'Not signed in.' };

  const companyId = await resolveCafeCompanyId();
  if (!companyId) return { ok: false, error: 'No company context.' };

  const supabase = createSupabaseServiceClient();
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
  const session = await requireCafeSession();
  if (!session) return { ok: false, error: 'Not signed in.' };

  const companyId = await resolveCafeCompanyId();
  if (!companyId) return { ok: false, error: 'No company context.' };

  const supabase = createSupabaseServiceClient();
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
  revalidatePath('/cafe-front/menu');
  return { ok: true };
}

export async function getCafeFrontOrders(): Promise<CafeFrontOrder[]> {
  noStore();
  const companyId = await resolveCafeCompanyId();
  if (!companyId) return [];

  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from('cafe_customer_orders')
    .select(
      'id, queue_number, fulfillment_type, customer_name, customer_phone, delivery_address, items, total_lkr, status, placed_at, payment_received_at, accepted_by_employee_id, accepted_at, ready_at, prep_seconds',
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
      error: 'Shift check-in required — rostered shift + GPS selfie check-in before accepting orders.',
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
  const session = await requireCafeSession();
  if (!session) return { shifts: [], leaveDates: [] as string[] };

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
