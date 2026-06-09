'use server';

import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { revalidatePath } from 'next/cache';
import { calculateStandardDay } from '../../lib/compensation-engine';
import { completedYearsOfService } from '../../../../packages/gratuity';
import { adjustedMonthlyBasicFromRank } from '../../../../packages/rank-pay-matrix';
import { getRankPayMatrix } from '../executive/settings/rank-matrix-actions';
import { auditStaffAction } from '../../lib/staff-audit';

function calculateStatutory(grossPay: number) {
  return {
    epf_employee_8: Number((grossPay * 0.08).toFixed(2)),
    epf_employer_12: Number((grossPay * 0.12).toFixed(2)),
    etf_employer_3: Number((grossPay * 0.03).toFixed(2)),
  };
}

export async function generateMonthEndPayroll(formData: FormData) {
  const supabase = await createSupabaseServerClient();

  const month = parseInt(formData.get('month') as string);
  const year = parseInt(formData.get('year') as string);

  const { data: employees, error: empError } = await supabase
    .from('employees')
    .select('*')
    .in('status', ['ACTIVE']);

  if (empError) {
    console.error('❌ SUPABASE ERROR (Employees):', empError.message);
    return { success: false, error: empError.message };
  }

  const rankMatrix = await getRankPayMatrix();
  const periodEndIso = `${year}-${String(month).padStart(2, '0')}-28`;

  let processedCount = 0;

  for (const emp of employees || []) {
    const row = emp as Record<string, unknown>;
    const rank = row.rank != null ? String(row.rank) : null;
    const years = completedYearsOfService(
      row.date_joined != null ? String(row.date_joined) : null,
      periodEndIso,
    );
    const recordedBasic =
      row.basic_salary != null
        ? Number(row.basic_salary)
        : row.base_salary != null
          ? Number(row.base_salary)
          : null;

    const B = adjustedMonthlyBasicFromRank(rankMatrix, rank, years, recordedBasic);

    if (Boolean(row.requires_md_approval)) {
      console.warn(
        `Skipping payroll for ${row.emp_number ?? emp.id}: pending MD salary approval`,
      );
      continue;
    }

    const grossPay = calculateStandardDay(B).grossPay * 20;

    const { data: advances } = await supabase
      .from('salary_advances')
      .select('amount')
      .eq('profile_id', emp.id)
      .eq('status', 'APPROVED');

    const totalAdvances =
      advances?.reduce((sum, adv) => sum + Number(adv.amount), 0) || 0;

    const statutory = calculateStatutory(grossPay);
    const netPay = grossPay - statutory.epf_employee_8 - totalAdvances;

    const { error: insertError } = await supabase.from('payslips').insert({
      profile_id: emp.id,
      company_id: emp.company_id,
      period_month: month,
      period_year: year,
      adjusted_basic: B,
      gross_pay: grossPay,
      net_pay: netPay,
      epf_employee: statutory.epf_employee_8,
      epf_employer: statutory.epf_employer_12,
      etf: statutory.etf_employer_3,
      status: 'DRAFT',
    });

    if (insertError) {
      console.error(
        `❌ SUPABASE ERROR (Payslip for ${profile.emp_number}):`,
        insertError.message
      );
    } else {
      processedCount++;
    }
  }

  await auditStaffAction({
    supabase,
    portal: 'fm',
    action: 'Generate Month-End Payroll',
    targetEntity: `${year}-${String(month).padStart(2, '0')}`,
    details: { month, year, processedCount },
  });

  revalidatePath('/fm');
  revalidatePath('/fm/batch');
  return { success: true, count: processedCount };
}
