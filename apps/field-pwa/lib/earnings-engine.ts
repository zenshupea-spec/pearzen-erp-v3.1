import { createSupabaseServerClient } from '../../../packages/supabase/server';

const WB_WORKING_DAYS = 26;
const DEFAULT_SHIFT_PAY_LKR = 2000;

function todayInColombo(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(
    new Date(),
  );
}

function dateInColombo(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(d);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00+05:30`);
  d.setDate(d.getDate() + days);
  return dateInColombo(d);
}

function shiftPayFromSalary(baseSalary: unknown): number {
  const salary = Number(baseSalary);
  if (Number.isFinite(salary) && salary > 0) {
    return Math.round(salary / WB_WORKING_DAYS);
  }
  return DEFAULT_SHIFT_PAY_LKR;
}

export type TodayEarningsResult = {
  todayTotal: number;
  currency: 'LKR';
  shiftsCompleted: number;
  shiftPay: number;
  onShift: boolean;
  rosteredToday: number;
};

/**
 * Today's earnings use the origin rule: pay is attributed to the calendar day
 * the shift starts (Asia/Colombo), even if checkout is after midnight.
 */
export async function calculateTodayEarnings(
  empNumber: string,
): Promise<TodayEarningsResult> {
  const empty: TodayEarningsResult = {
    todayTotal: 0,
    currency: 'LKR',
    shiftsCompleted: 0,
    shiftPay: DEFAULT_SHIFT_PAY_LKR,
    onShift: false,
    rosteredToday: 0,
  };

  try {
    const supabase = await createSupabaseServerClient();
    const today = todayInColombo();

    const { data: employee } = await supabase
      .from('employees')
      .select('id, base_salary')
      .eq('emp_number', empNumber)
      .eq('status', 'ACTIVE')
      .single();

    if (!employee) return empty;

    const shiftPay = shiftPayFromSalary(employee.base_salary);

    const { data: rosters } = await supabase
      .from('time_rosters')
      .select('id, shift_date, planned_start_time')
      .eq('employee_id', employee.id)
      .eq('shift_date', today)
      .eq('status', 'ACTIVE');

    const rosteredToday = rosters?.length ?? 0;
    if (rosteredToday === 0) {
      return { ...empty, shiftPay };
    }

    const windowStart = `${today}T00:00:00+05:30`;
    const windowEnd = `${addDays(today, 2)}T00:00:00+05:30`;

    const { data: logs, error } = await supabase
      .from('attendance_logs')
      .select('action_type, device_time, status')
      .eq('emp_number', empNumber)
      .gte('device_time', windowStart)
      .lt('device_time', windowEnd)
      .order('device_time', { ascending: true });

    if (error) throw error;

    let completedShifts = 0;
    let onShift = false;
    let lastCheckInDate: string | null = null;
    let lastCheckInApproved = false;

    for (const log of logs ?? []) {
      if (log.action_type === 'CHECK_IN') {
        lastCheckInDate = dateInColombo(log.device_time);
        lastCheckInApproved = log.status === 'APPROVED';
        onShift = lastCheckInDate === today;
      } else if (log.action_type === 'CHECK_OUT' && lastCheckInDate) {
        if (
          lastCheckInDate === today &&
          lastCheckInApproved &&
          log.status === 'APPROVED'
        ) {
          completedShifts += 1;
        }
        lastCheckInDate = null;
        lastCheckInApproved = false;
        onShift = false;
      }
    }

    completedShifts = Math.min(completedShifts, rosteredToday);

    return {
      todayTotal: completedShifts * shiftPay,
      currency: 'LKR',
      shiftsCompleted: completedShifts,
      shiftPay,
      onShift,
      rosteredToday,
    };
  } catch (err) {
    console.error('Today earnings engine error:', err);
    return empty;
  }
}

/** @deprecated Use calculateTodayEarnings for the guard portal dashboard */
export async function calculateLiveMTD(empNumber: string) {
  const today = await calculateTodayEarnings(empNumber);
  return {
    mtdTotal: today.todayTotal,
    currency: today.currency,
    hoursWorked: today.shiftsCompleted > 0 ? String(today.shiftsCompleted * 12) : undefined,
  };
}
