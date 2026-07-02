'use server';

import { revalidatePath } from 'next/cache';

import { resolveCompanyIdForSession } from '../../lib/company-context-server';
import { assertSalonVerticalAccessForSession } from '../../lib/salon-vertical-server';
import type {
  SalonAppointmentRow,
  SalonAppointmentStatus,
  SalonDeskSummary,
  SalonPaymentMethod,
  SalonPosLineItem,
  SalonPosTransactionRow,
  SalonProductRow,
  SalonServiceRow,
} from '../../lib/salon-types';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../packages/supabase/service';
import { fetchBackOfficeUserProfile } from '../../lib/hr-portal-access-server';

const SALON_PATHS = ['/salon', '/salon/bookings', '/salon/pos', '/salon/catalog'] as const;

function revalidateSalonPaths() {
  for (const path of SALON_PATHS) {
    revalidatePath(path);
  }
}

async function requireSalonCompanyId(role: string | null | undefined): Promise<string> {
  const access = await assertSalonVerticalAccessForSession(role);
  if ('error' in access) {
    throw new Error(access.error);
  }
  return access.companyId;
}

function mapService(row: Record<string, unknown>): SalonServiceRow {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    name: String(row.name ?? ''),
    durationMinutes: Number(row.duration_minutes ?? 60),
    priceLkr: Number(row.price_lkr ?? 0),
    isActive: row.is_active !== false,
    sortOrder: Number(row.sort_order ?? 0),
  };
}

function mapProduct(row: Record<string, unknown>): SalonProductRow {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    name: String(row.name ?? ''),
    sku: row.sku != null ? String(row.sku) : null,
    unitPriceLkr: Number(row.unit_price_lkr ?? 0),
    stockOnHand: Number(row.stock_on_hand ?? 0),
    isActive: row.is_active !== false,
  };
}

function mapAppointment(
  row: Record<string, unknown>,
  serviceName?: string | null,
): SalonAppointmentRow {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    serviceId: row.service_id != null ? String(row.service_id) : null,
    serviceName: serviceName ?? null,
    clientName: String(row.client_name ?? ''),
    clientPhone: row.client_phone != null ? String(row.client_phone) : null,
    scheduledStart: String(row.scheduled_start ?? ''),
    scheduledEnd: String(row.scheduled_end ?? ''),
    status: String(row.status ?? 'scheduled') as SalonAppointmentStatus,
    notes: row.notes != null ? String(row.notes) : null,
  };
}

function mapPosTransaction(row: Record<string, unknown>): SalonPosTransactionRow {
  const rawLines = row.line_items;
  const lineItems = Array.isArray(rawLines)
    ? (rawLines as SalonPosLineItem[])
    : [];

  return {
    id: String(row.id),
    companyId: String(row.company_id),
    receiptNumber: String(row.receipt_number ?? ''),
    totalLkr: Number(row.total_lkr ?? 0),
    paymentMethod: String(row.payment_method ?? 'cash') as SalonPaymentMethod,
    lineItems,
    notes: row.notes != null ? String(row.notes) : null,
    createdByEmail: row.created_by_email != null ? String(row.created_by_email) : null,
    createdAt: String(row.created_at ?? ''),
  };
}

export async function fetchSalonDeskSummary(): Promise<SalonDeskSummary> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user
    ? await fetchBackOfficeUserProfile(supabase, user)
    : { role: null };
  const companyId = await requireSalonCompanyId(profile.role);
  const db = createSupabaseServiceClient();

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const [services, products, appointments, pos] = await Promise.all([
    db.from('salon_services').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
    db.from('salon_products').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
    db
      .from('salon_appointments')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'scheduled')
      .gte('scheduled_start', now.toISOString()),
    db
      .from('salon_pos_transactions')
      .select('total_lkr')
      .eq('company_id', companyId)
      .gte('created_at', startOfDay.toISOString())
      .lte('created_at', endOfDay.toISOString()),
  ]);

  const todayPosTotalLkr = (pos.data ?? []).reduce(
    (sum, row) => sum + Number((row as { total_lkr?: number }).total_lkr ?? 0),
    0,
  );

  return {
    serviceCount: services.count ?? 0,
    productCount: products.count ?? 0,
    upcomingAppointments: appointments.count ?? 0,
    todayPosTotalLkr,
  };
}

export async function fetchSalonServices(): Promise<SalonServiceRow[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user
    ? await fetchBackOfficeUserProfile(supabase, user)
    : { role: null };
  const companyId = await requireSalonCompanyId(profile.role);
  const db = createSupabaseServiceClient();

  const { data, error } = await db
    .from('salon_services')
    .select('*')
    .eq('company_id', companyId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapService(row as Record<string, unknown>));
}

export async function fetchSalonProducts(): Promise<SalonProductRow[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user
    ? await fetchBackOfficeUserProfile(supabase, user)
    : { role: null };
  const companyId = await requireSalonCompanyId(profile.role);
  const db = createSupabaseServiceClient();

  const { data, error } = await db
    .from('salon_products')
    .select('*')
    .eq('company_id', companyId)
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapProduct(row as Record<string, unknown>));
}

export async function fetchSalonAppointments(): Promise<SalonAppointmentRow[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user
    ? await fetchBackOfficeUserProfile(supabase, user)
    : { role: null };
  const companyId = await requireSalonCompanyId(profile.role);
  const db = createSupabaseServiceClient();

  const { data, error } = await db
    .from('salon_appointments')
    .select('*, salon_services(name)')
    .eq('company_id', companyId)
    .order('scheduled_start', { ascending: true })
    .limit(100);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    const nested = record.salon_services as { name?: string } | null;
    return mapAppointment(record, nested?.name ?? null);
  });
}

export async function fetchSalonPosTransactions(): Promise<SalonPosTransactionRow[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user
    ? await fetchBackOfficeUserProfile(supabase, user)
    : { role: null };
  const companyId = await requireSalonCompanyId(profile.role);
  const db = createSupabaseServiceClient();

  const { data, error } = await db
    .from('salon_pos_transactions')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapPosTransaction(row as Record<string, unknown>));
}

export async function saveSalonService(input: {
  id?: string;
  name: string;
  durationMinutes: number;
  priceLkr: number;
  isActive: boolean;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user
    ? await fetchBackOfficeUserProfile(supabase, user)
    : { role: null };
  const companyId = await requireSalonCompanyId(profile.role);
  const db = createSupabaseServiceClient();

  const name = input.name.trim();
  if (!name) return { success: false as const, error: 'Service name is required.' };

  const payload = {
    company_id: companyId,
    name: name.toUpperCase(),
    duration_minutes: Math.max(15, Math.round(input.durationMinutes)),
    price_lkr: Math.max(0, Number(input.priceLkr)),
    is_active: input.isActive,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { error } = await db
      .from('salon_services')
      .update(payload)
      .eq('id', input.id)
      .eq('company_id', companyId);
    if (error) return { success: false as const, error: error.message };
  } else {
    const { error } = await db.from('salon_services').insert([payload]);
    if (error) return { success: false as const, error: error.message };
  }

  revalidateSalonPaths();
  return { success: true as const };
}

export async function saveSalonProduct(input: {
  id?: string;
  name: string;
  sku?: string;
  unitPriceLkr: number;
  stockOnHand: number;
  isActive: boolean;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user
    ? await fetchBackOfficeUserProfile(supabase, user)
    : { role: null };
  const companyId = await requireSalonCompanyId(profile.role);
  const db = createSupabaseServiceClient();

  const name = input.name.trim();
  if (!name) return { success: false as const, error: 'Product name is required.' };

  const payload = {
    company_id: companyId,
    name: name.toUpperCase(),
    sku: input.sku?.trim() || null,
    unit_price_lkr: Math.max(0, Number(input.unitPriceLkr)),
    stock_on_hand: Math.max(0, Math.round(input.stockOnHand)),
    is_active: input.isActive,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { error } = await db
      .from('salon_products')
      .update(payload)
      .eq('id', input.id)
      .eq('company_id', companyId);
    if (error) return { success: false as const, error: error.message };
  } else {
    const { error } = await db.from('salon_products').insert([payload]);
    if (error) return { success: false as const, error: error.message };
  }

  revalidateSalonPaths();
  return { success: true as const };
}

export async function saveSalonAppointment(input: {
  id?: string;
  serviceId?: string | null;
  clientName: string;
  clientPhone?: string;
  scheduledStart: string;
  durationMinutes: number;
  status?: SalonAppointmentStatus;
  notes?: string;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user
    ? await fetchBackOfficeUserProfile(supabase, user)
    : { role: null };
  const companyId = await requireSalonCompanyId(profile.role);
  const db = createSupabaseServiceClient();

  const clientName = input.clientName.trim();
  if (!clientName) return { success: false as const, error: 'Client name is required.' };

  const start = new Date(input.scheduledStart);
  if (Number.isNaN(start.getTime())) {
    return { success: false as const, error: 'Invalid appointment start time.' };
  }

  const end = new Date(start.getTime() + Math.max(15, input.durationMinutes) * 60_000);

  const payload = {
    company_id: companyId,
    service_id: input.serviceId?.trim() || null,
    client_name: clientName,
    client_phone: input.clientPhone?.trim() || null,
    scheduled_start: start.toISOString(),
    scheduled_end: end.toISOString(),
    status: input.status ?? 'scheduled',
    notes: input.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { error } = await db
      .from('salon_appointments')
      .update(payload)
      .eq('id', input.id)
      .eq('company_id', companyId);
    if (error) return { success: false as const, error: error.message };
  } else {
    const { error } = await db.from('salon_appointments').insert([payload]);
    if (error) return { success: false as const, error: error.message };
  }

  revalidateSalonPaths();
  return { success: true as const };
}

export async function recordSalonPosTransaction(input: {
  lineItems: SalonPosLineItem[];
  paymentMethod: SalonPaymentMethod;
  notes?: string;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user
    ? await fetchBackOfficeUserProfile(supabase, user)
    : { role: null };
  const companyId = await requireSalonCompanyId(profile.role);
  const db = createSupabaseServiceClient();

  const lineItems = input.lineItems.filter((line) => line.name.trim() && line.quantity > 0);
  if (!lineItems.length) {
    return { success: false as const, error: 'Add at least one line item.' };
  }

  const totalLkr = lineItems.reduce((sum, line) => sum + line.lineTotalLkr, 0);
  const receiptNumber = `SLN-${Date.now().toString(36).toUpperCase()}`;

  const { error } = await db.from('salon_pos_transactions').insert([
    {
      company_id: companyId,
      receipt_number: receiptNumber,
      total_lkr: totalLkr,
      payment_method: input.paymentMethod,
      line_items: lineItems,
      notes: input.notes?.trim() || null,
      created_by_email: user?.email?.trim().toLowerCase() ?? null,
    },
  ]);

  if (error) return { success: false as const, error: error.message };

  revalidateSalonPaths();
  return { success: true as const, receiptNumber };
}

export async function resolveSalonCompanyForSession(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  return resolveCompanyIdForSession(supabase);
}
