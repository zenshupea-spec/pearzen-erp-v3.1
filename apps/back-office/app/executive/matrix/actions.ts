'use server';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { revalidatePath } from 'next/cache';

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

// Fetch employees with "Pending Salary Approval" (Yellow Flag)
export async function fetchPendingSalaryOverrides() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('employees')
    .select('id, first_name, last_name, custom_salary, status')
    .eq('salary_approval_status', 'PENDING_MD');

  if (error) {
    console.error("❌ SUPABASE ERROR (Fetch Overrides):", error.message);
    return [];
  }
  return data || [];
}
