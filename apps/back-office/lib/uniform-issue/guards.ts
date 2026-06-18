import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { resolveCompanyIdForSession } from '../../lib/company-context-server';
import type { UniformGuardOption } from './types';

function guardLabel(empNumber: string, fullName: string | null) {
  const name = fullName?.trim();
  return name ? `${empNumber} — ${name}` : empNumber;
}

export async function getGuardsForUniformIssue(): Promise<UniformGuardOption[]> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);

  let query = supabase
    .from('employees')
    .select('emp_number, full_name, site, group')
    .eq('status', 'ACTIVE')
    .order('emp_number', { ascending: true });

  if (companyId) query = query.eq('company_id', companyId);

  const { data, error } = await query;
  if (error) {
    console.error('[Uniform issue] guards:', error.message);
    return [];
  }

  return (data ?? [])
    .filter(
      (row) =>
        String(row.emp_number ?? '').trim() !== '' &&
        (String(row.group ?? '').toUpperCase() === 'GUARD' ||
          (row.site != null && String(row.site).trim() !== '')),
    )
    .map((row) => ({
      value: String(row.emp_number).trim().toUpperCase(),
      label: guardLabel(String(row.emp_number).trim().toUpperCase(), row.full_name as string | null),
    }));
}
