'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import {
  getEmployeeClearance,
  type EmployeeClearanceSnapshot,
} from '../hr/mnr/clearance-actions';
import type { UnsettledBalanceLine } from '../../lib/employee-clearance-ledger';

async function requireFmRole() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'FM') {
    throw new Error('Only Finance Manager can confirm offboarding payments.');
  }

  return { supabase, userId: user.id };
}

export type FmOffboardingQueueRow = {
  employeeId: string;
  fullName: string;
  empNo: string | null;
  rank: string | null;
  finalPayLkr: number;
  gratuityLkr: number;
  recoveryLkr: number;
  netSettlementLkr: number;
  hrSentToFmAt: string | null;
  unsettledBalances: UnsettledBalanceLine[];
  fmOffboardingPaymentConfirmed: boolean;
  needsFmConfirm: boolean;
  blockedByDebt: boolean;
  blockMessage: string | null;
};

function rowFromSnapshot(
  snapshot: EmployeeClearanceSnapshot,
  hrSentToFmAt: string | null,
): FmOffboardingQueueRow {
  const payable = snapshot.settlement.finalPayLkr + snapshot.settlement.gratuityLkr;
  const needsFmConfirm = payable > 0 && !snapshot.fmOffboardingPaymentConfirmed;
  const blockedByDebt = snapshot.hrResignationGate.requiresDebtClearance;
  const blockMessage = blockedByDebt ? snapshot.hrResignationGate.message : null;

  return {
    employeeId: snapshot.employeeId,
    fullName: snapshot.fullName,
    empNo: snapshot.empNo,
    rank: snapshot.rank,
    finalPayLkr: snapshot.settlement.finalPayLkr,
    gratuityLkr: snapshot.settlement.gratuityLkr,
    recoveryLkr: snapshot.settlement.recoveryLkr,
    netSettlementLkr: snapshot.settlement.netSettlementLkr,
    hrSentToFmAt,
    unsettledBalances: snapshot.unsettledBalances,
    fmOffboardingPaymentConfirmed: snapshot.fmOffboardingPaymentConfirmed,
    needsFmConfirm,
    blockedByDebt,
    blockMessage,
  };
}

export async function listFmOffboardingQueue(): Promise<FmOffboardingQueueRow[]> {
  await requireFmRole();
  const supabase = await createSupabaseServerClient();

  const selectWithHr =
    'id, full_name, emp_number, rank, status, fm_offboarding_payment_confirmed_at, hr_offboarding_sent_to_fm_at';
  let { data: employees, error } = await supabase
    .from('employees')
    .select(selectWithHr)
    .not('status', 'ilike', 'resigned')
    .not('hr_offboarding_sent_to_fm_at', 'is', null);

  if (error?.message?.includes('hr_offboarding_sent_to_fm')) {
    return [];
  }
  if (error) throw new Error(error.message);

  const rows: FmOffboardingQueueRow[] = [];

  for (const emp of employees ?? []) {
    try {
      const snapshot = await getEmployeeClearance(emp.id);
      const hrSentToFmAt =
        (emp as { hr_offboarding_sent_to_fm_at?: string | null }).hr_offboarding_sent_to_fm_at ??
        snapshot.hrOffboardingSentToFmAt;
      rows.push(rowFromSnapshot(snapshot, hrSentToFmAt));
    } catch {
      // Skip employees that fail partial schema loads
    }
  }

  return rows.sort((a, b) => {
    if (a.needsFmConfirm !== b.needsFmConfirm) return a.needsFmConfirm ? -1 : 1;
    if (a.blockedByDebt !== b.blockedByDebt) return a.blockedByDebt ? -1 : 1;
    const aSent = a.hrSentToFmAt ? new Date(a.hrSentToFmAt).getTime() : 0;
    const bSent = b.hrSentToFmAt ? new Date(b.hrSentToFmAt).getTime() : 0;
    if (aSent !== bSent) return aSent - bSent;
    return a.fullName.localeCompare(b.fullName);
  });
}

export async function confirmFmOffboardingPayment(employeeId: string) {
  const { supabase, userId } = await requireFmRole();
  const snapshot = await getEmployeeClearance(employeeId);

  if (!snapshot.hrOffboardingSentToFm) {
    throw new Error('HR has not sent this employee to the offboarding queue yet.');
  }

  if (snapshot.fmOffboardingPaymentConfirmed) {
    throw new Error('Payment was already confirmed for this employee.');
  }

  const payable = snapshot.settlement.finalPayLkr + snapshot.settlement.gratuityLkr;
  if (payable <= 0) {
    throw new Error('No final payment is due — FM confirmation is not required for this employee.');
  }

  if (snapshot.hrResignationGate.requiresDebtClearance) {
    throw new Error(snapshot.hrResignationGate.message);
  }

  if (snapshot.settlement.netSettlementLkr < 0) {
    throw new Error(
      'Employee owes a net balance to the company. Settle all pending recoveries before confirming payment.',
    );
  }

  const { error } = await supabase
    .from('employees')
    .update({
      fm_offboarding_payment_confirmed_at: new Date().toISOString(),
      fm_offboarding_payment_confirmed_by: userId,
    })
    .eq('id', employeeId);

  if (error) throw new Error(error.message);

  revalidatePath('/fm/offboarding');
  revalidatePath('/hr/mnr');
}
