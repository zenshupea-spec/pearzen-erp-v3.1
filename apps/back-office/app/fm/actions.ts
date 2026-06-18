'use server';

import { generateMonthEndPayrollForPeriod } from './payroll-run-actions';

export async function generateMonthEndPayroll(formData: FormData) {
  const month = parseInt(formData.get('month') as string, 10);
  const year = parseInt(formData.get('year') as string, 10);

  if (!Number.isFinite(month) || !Number.isFinite(year)) {
    return { success: false, error: 'Payroll period month and year are required.' };
  }

  return generateMonthEndPayrollForPeriod(year, month);
}
