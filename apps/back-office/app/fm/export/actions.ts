'use server';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { decryptEmployeePiiValue } from '../../../lib/employee-pii';

export async function fetchBankExportData() {
  try {
    const supabase = await createSupabaseServerClient();
    
    // 1. Fetch active employees and their bank details from the MNR
    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('id, emp_number, full_name, bank_name, account_number, basic_salary')
      .neq('status', 'TERMINATED')
      .neq('status', 'RESIGNED');

    if (empError && empError.code !== '42P01') throw new Error(empError.message);
    if (!employees || employees.length === 0) return { success: true, data: [] };

    // 2. Fetch all APPROVED salary advances to deduct from this month's pay
    const { data: advances, error: advError } = await supabase
      .from('salary_advances')
      .select('emp_number, amount')
      .eq('status', 'APPROVED');

    if (advError && advError.code !== '42P01') throw new Error(advError.message);

    // 3. Map the data and apply the Financial Engine math
    const exportData = employees.map((emp) => {
      // Calculate total approved advances for this specific employee
      const totalAdvances = (advances || [])
        .filter(a => a.emp_number === emp.emp_number)
        .reduce((sum, a) => sum + Number(a.amount || 0), 0);

      // Base pay logic (Hooking into the Compensation Engine logic later)
      const grossPay = Number(emp.basic_salary || 0);
      let netPay = grossPay - totalAdvances;
      if (netPay < 0) netPay = 0; // Prevent negative payouts

      const bankName = (emp.bank_name || 'UNKNOWN').toUpperCase();
      
      return {
        emp_id: emp.emp_number || emp.id.substring(0,8).toUpperCase(),
        beneficiary: (emp.full_name || 'UNNAMED EMPLOYEE').toUpperCase(),
        bank_name: bankName,
        account_number: decryptEmployeePiiValue(emp.account_number) || 'N/A',
        net_pay: netPay,
        is_commercial_bank: bankName.includes('COMMERCIAL') || bankName === 'COMBANK',
        reference: `SALARY-${new Date().toISOString().slice(0,7).replace('-','')}`
      };
    });

    return { success: true, data: exportData };
  } catch (error: any) {
    console.error("❌ SUPABASE ERROR (FM Export):", error.message);
    return { success: false, data: [], error: error.message };
  }
}
