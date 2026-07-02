'use server';

import { unstable_noStore as noStore } from 'next/cache';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import { revalidatePath } from 'next/cache';

import {
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../../lib/company-context-server';
import {
  mapSalaryOverrideRow,
  payrollExceptionOrFilter,
} from '../../../lib/hr-payroll-exception-query';

// Fetch all defined ranks and their default pay constants
export async function fetchRankMatrix() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('ranks')
    .select('*')
    .order('rank_level', { ascending: true });

  if (error) {
    console.error("❌ SUPABASE ERROR (Fetch Matrix):", error.message);
    return [];
  }
  return data || [];
}

// Update a rank's basic or increment amount
export async function updateRankPay(rankId: string, payload: { default_basic: number, annual_increment: number }) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('ranks')
    .update(payload)
    .eq('id', rankId);

  if (error) {
    console.error("❌ SUPABASE ERROR (Update Rank):", error.message);
    return { success: false, error: error.message };
  }

  revalidatePath('/executive/matrix');
  return { success: true };
}

// Fetch employees with pending salary approval or MD approval flag (Yellow Flag)
export async function fetchPendingSalaryOverrides() {
  noStore();
  const supabase = await createSupabaseServerClient();
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  const companyId = rosterCompanyId(sessionCompanyId);
  if (!companyId) return [];

  const db = createSupabaseServiceClient();
  const { data, error } = await db
    .from('employees')
    .select(
      'id, full_name, rank, group, custom_salary, base_salary, basic_salary, salary_approval_status, requires_md_approval, updated_at',
    )
    .eq('company_id', companyId)
    .or(payrollExceptionOrFilter());

  if (error) {
    console.error('❌ SUPABASE ERROR (Fetch Overrides):', error.message);
    return [];
  }
  return (data ?? []).map(mapSalaryOverrideRow);
}
