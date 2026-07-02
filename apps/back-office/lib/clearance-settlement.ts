export type ClearanceSettlement = {
  /** Estimated final salary / net take-home for last worked month */
  finalPayLkr: number;
  /** Statutory gratuity owed to employee (0 if not eligible) */
  gratuityLkr: number;
  /** Uniform, meals, advance, penalties still owed to company */
  recoveryLkr: number;
  /** finalPay + gratuity − recovery: positive = pay employee, negative = employee owes company */
  netSettlementLkr: number;
};

export function computeClearanceSettlement(
  netTakeHomeLastMonthLkr: number | null | undefined,
  totalOwedToCompanyLkr: number,
  gratuityLkr = 0,
): ClearanceSettlement {
  const finalPayLkr = Math.max(0, Number(netTakeHomeLastMonthLkr) || 0);
  const gratuity = Math.max(0, Number(gratuityLkr) || 0);
  const recoveryLkr = Math.max(0, Number(totalOwedToCompanyLkr) || 0);
  const netSettlementLkr = finalPayLkr + gratuity - recoveryLkr;
  return { finalPayLkr, gratuityLkr: gratuity, recoveryLkr, netSettlementLkr };
}

export type HrResignationGate = {
  ok: boolean;
  message: string;
};

/** Whether HR may confirm clearance and resignation from the MNR modal. */
export function evaluateHrResignationGate(input: {
  uniformCollectionOk?: boolean;
  uniformCollectionPending?: boolean;
}): HrResignationGate {
  const { uniformCollectionOk = true, uniformCollectionPending = false } = input;

  if (uniformCollectionOk === false) {
    return {
      ok: false,
      message: uniformCollectionPending
        ? 'Wait for Deductions Admin to confirm uniform collection, or request collection first.'
        : 'Request uniform collection before confirming clearance.',
    };
  }

  return {
    ok: true,
    message: 'Review the settlement below, then confirm clearance and resignation.',
  };
}

export function formatClearanceSettlementAmount(n: number) {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    maximumFractionDigits: 0,
  }).format(n);
}
