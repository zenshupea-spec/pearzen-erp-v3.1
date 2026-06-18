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

    const db = createSupabaseServiceClient();
    const { error } = await db.from('expense_bills').insert({
      company_id: companyId,
      bill_date: input.date,
      submitted_by: input.submittedBy?.trim() || profile.full_name || 'Executive Admin',
      cost_center: input.costCenter,
      description: input.description.trim(),
      amount: input.amount,
      receipt_url: input.receiptUrl ?? '',
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
