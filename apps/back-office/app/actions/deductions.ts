'use server';

import { revalidatePath } from 'next/cache';
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from '../../../../packages/supabase/server';
import {
  resolveCompanyIdForSession,
} from '../../lib/company-context-server';

export type DeductionGuardOption = {
  id: string;
  empNumber: string;
  name: string;
};

export async function listGuardsForDeductions(): Promise<DeductionGuardOption[]> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) throw new Error('Tenant context is required.');

  let query = supabase
    .from('employees')
    .select('id, emp_number, full_name, status')
    .eq('company_id', companyId)
    .eq('status', 'ACTIVE')
    .order('full_name', { ascending: true })
    .limit(500);

  let { data, error } = await query;

  if ((!data?.length || error) && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const service = createSupabaseServiceClient();
    const res = await service
      .from('employees')
      .select('id, emp_number, full_name, status')
      .eq('company_id', companyId)
      .eq('status', 'ACTIVE')
      .order('full_name', { ascending: true })
      .limit(500);
    data = res.data;
    error = res.error;
  }

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: String(row.id),
    empNumber: String(row.emp_number ?? ''),
    name: String(row.full_name ?? ''),
  }));
}

export async function submitManualDeduction(
  guardId: string,
  category: string,
  amount: number,
  reason: string,
  appliedMonth: string
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) throw new Error('Tenant context is required.');

  const { error } = await supabase.from('payroll_deductions').insert({
    company_id: companyId,
    guard_id: guardId,
    category,
    amount,
    reason,
    applied_month: appliedMonth,
    added_by: user.id,
  });

  if (error) throw new Error('Failed to apply deduction: ' + error.message);

  revalidatePath('/deductions');
  return { success: true as const };
}
