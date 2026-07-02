'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../packages/supabase/service';
import {
  fetchBackOfficeUserProfile,
} from '../../lib/hr-portal-access-server';
import { normalizePortalRole } from '../../lib/portal-role-utils';
import {
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../lib/company-context-server';
import {
  createOpexReceiptSignedUrl,
  uploadOpexReceiptBuffer,
} from '../../../../packages/supabase/opex-receipt-storage';

export type BillCostCenter = 'Security' | 'Café' | 'BnB';
export type BillStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

export type ExpenseBillRecord = {
  id: string;
  date: string;
  submittedBy: string;
  costCenter: BillCostCenter;
  description: string;
  amount: number;
  receiptUrl: string;
  status: BillStatus;
  approvedAt?: string;
  isSplit?: boolean;
  splitAllocations?: Partial<Record<BillCostCenter, number>>;
};

const BILL_PATH = '/executive/bills';

function isMissingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === '42P01' || /expense_bills/i.test(error.message ?? '');
}

async function resolveCompanyId() {
  const supabase = await createSupabaseServerClient();
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  return rosterCompanyId(sessionCompanyId);
}

async function requireExecutiveRole() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Unauthorized');

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const role = normalizePortalRole(profile.role);
  if (role !== 'MD' && role !== 'OD' && role !== 'EA') throw new Error('Forbidden');
  return { user, profile };
}

function rowToBill(row: Record<string, unknown>): ExpenseBillRecord {
  const split = row.split_allocations as Record<string, number> | null;
  return {
    id: String(row.id),
    date: String(row.bill_date).slice(0, 10),
    submittedBy: String(row.submitted_by ?? ''),
    costCenter: row.cost_center as BillCostCenter,
    description: String(row.description ?? ''),
    amount: Number(row.amount ?? 0),
    receiptUrl: String(row.receipt_url ?? ''),
    status: row.status as BillStatus,
    approvedAt: row.approved_at ? String(row.approved_at) : undefined,
    isSplit: Boolean(row.is_split),
    splitAllocations: split
      ? {
          Security: split.Security,
          Café: split['Café'] ?? split.Cafe,
          BnB: split.BnB,
        }
      : undefined,
  };
}

export async function fetchExpenseBills(): Promise<{
  bills: ExpenseBillRecord[];
  tableReady: boolean;
  error?: string;
}> {
  try {
    const companyId = await resolveCompanyId();
    if (!companyId) return { bills: [], tableReady: false, error: 'No company context' };

    const db = createSupabaseServiceClient();
    const { data, error } = await db
      .from('expense_bills')
      .select('*')
      .eq('company_id', companyId)
      .order('bill_date', { ascending: false });

    if (isMissingTable(error)) {
      return { bills: [], tableReady: false, error: 'Expense bills table not applied yet.' };
    }
    if (error) {
      console.error('fetchExpenseBills:', error.message);
      return { bills: [], tableReady: false, error: error.message };
    }

    return { bills: (data ?? []).map((row) => rowToBill(row as Record<string, unknown>)), tableReady: true };
  } catch (err) {
    return {
      bills: [],
      tableReady: false,
      error: err instanceof Error ? err.message : 'Failed to load bills',
    };
  }
}

export async function submitExpenseBill(input: {
  date: string;
  description: string;
  amount: number;
  costCenter: BillCostCenter;
  submittedBy?: string;
  isSplit?: boolean;
  splitAllocations?: Partial<Record<BillCostCenter, number>>;
  receiptUrl?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { profile } = await requireExecutiveRole();
    const companyId = await resolveCompanyId();
    if (!companyId) return { success: false, error: 'No company context' };

    const receiptUrl = input.receiptUrl?.trim() ?? '';
    if (!receiptUrl) {
      return { success: false, error: 'Receipt upload is required.' };
    }

    const db = createSupabaseServiceClient();
    const { error } = await db.from('expense_bills').insert({
      company_id: companyId,
      bill_date: input.date,
      submitted_by: input.submittedBy?.trim() || profile.full_name || 'Executive Admin',
      cost_center: input.costCenter,
      description: input.description.trim(),
      amount: input.amount,
      receipt_url: receiptUrl,
      status: 'PENDING_APPROVAL',
      is_split: Boolean(input.isSplit),
      split_allocations: input.splitAllocations ?? {},
    });

    if (error) return { success: false, error: error.message };
    revalidatePath(BILL_PATH);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Submit failed' };
  }
}

function parseSplitAllocations(
  raw: FormDataEntryValue | null,
): Partial<Record<BillCostCenter, number>> | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<BillCostCenter, number>>;
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export async function submitExpenseBillFromForm(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { profile } = await requireExecutiveRole();
    const companyId = await resolveCompanyId();
    if (!companyId) return { success: false, error: 'No company context' };

    const receiptFile = formData.get('receipt');
    if (!(receiptFile instanceof File) || receiptFile.size <= 0) {
      return { success: false, error: 'Receipt photo is required.' };
    }

    const date = String(formData.get('date') ?? '').slice(0, 10);
    const description = String(formData.get('description') ?? '').trim();
    const amount = Number(formData.get('amount') ?? 0);
    const costCenter = String(formData.get('costCenter') ?? '') as BillCostCenter;
    const submittedBy = String(formData.get('submittedBy') ?? '').trim();
    const isSplit = String(formData.get('isSplit') ?? '') === 'true';
    const splitAllocations = parseSplitAllocations(formData.get('splitAllocations'));

    if (!date || !description || !Number.isFinite(amount) || amount <= 0) {
      return { success: false, error: 'Bill date, description, and amount are required.' };
    }
    if (!['Security', 'Café', 'BnB'].includes(costCenter)) {
      return { success: false, error: 'Invalid cost centre.' };
    }

    const db = createSupabaseServiceClient();
    const buffer = Buffer.from(await receiptFile.arrayBuffer());
    const contentType = receiptFile.type || 'application/octet-stream';
    const { storageRef } = await uploadOpexReceiptBuffer(
      db,
      companyId,
      buffer,
      contentType,
    );

    const { error } = await db.from('expense_bills').insert({
      company_id: companyId,
      bill_date: date,
      submitted_by: submittedBy || profile.full_name || 'Executive Admin',
      cost_center: costCenter,
      description,
      amount,
      receipt_url: storageRef,
      status: 'PENDING_APPROVAL',
      is_split: isSplit,
      split_allocations: splitAllocations ?? {},
    });

    if (error) return { success: false, error: error.message };
    revalidatePath(BILL_PATH);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Submit failed' };
  }
}

export async function fetchExpenseBillReceiptSignedUrl(
  billId: string,
): Promise<{ url: string | null; contentType: 'image' | 'pdf' | null; error?: string }> {
  try {
    await requireExecutiveRole();
    const companyId = await resolveCompanyId();
    if (!companyId) return { url: null, contentType: null, error: 'No company context' };

    const db = createSupabaseServiceClient();
    const { data, error } = await db
      .from('expense_bills')
      .select('receipt_url')
      .eq('id', billId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (error || !data?.receipt_url) {
      return { url: null, contentType: null, error: error?.message ?? 'Receipt not found.' };
    }

    const receiptUrl = String(data.receipt_url);
    const url = await createOpexReceiptSignedUrl(db, receiptUrl);
    const contentType = receiptUrl.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image';
    return { url, contentType };
  } catch (err) {
    return {
      url: null,
      contentType: null,
      error: err instanceof Error ? err.message : 'Failed to load receipt',
    };
  }
}

export async function approveExpenseBill(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { user } = await requireExecutiveRole();
    const companyId = await resolveCompanyId();
    if (!companyId) return { success: false, error: 'No company context' };

    const db = createSupabaseServiceClient();
    const now = new Date().toISOString();
    const { error } = await db
      .from('expense_bills')
      .update({
        status: 'APPROVED',
        approved_at: now,
        approved_by: user.id,
        updated_at: now,
      })
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) return { success: false, error: error.message };
    revalidatePath(BILL_PATH);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Approve failed' };
  }
}

export async function rejectExpenseBill(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requireExecutiveRole();
    const companyId = await resolveCompanyId();
    if (!companyId) return { success: false, error: 'No company context' };

    const db = createSupabaseServiceClient();
    const now = new Date().toISOString();
    const { error } = await db
      .from('expense_bills')
      .update({ status: 'REJECTED', updated_at: now })
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) return { success: false, error: error.message };
    revalidatePath(BILL_PATH);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Reject failed' };
  }
}
