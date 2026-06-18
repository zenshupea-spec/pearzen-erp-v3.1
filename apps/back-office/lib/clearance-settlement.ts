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
  requiresFmPaymentConfirm: boolean;
  requiresDebtClearance: boolean;
  message: string;
};

/** Whether HR may confirm resignation after FM / debt rules */
export function evaluateHrResignationGate(input: {
  settlement: ClearanceSettlement;
  fmOffboardingPaymentConfirmed: boolean;
}): HrResignationGate {
  const { settlement, fmOffboardingPaymentConfirmed } = input;
  const { finalPayLkr, gratuityLkr, recoveryLkr, netSettlementLkr } = settlement;
  const totalPayableToEmployee = finalPayLkr + gratuityLkr;

  if (netSettlementLkr < 0 || (recoveryLkr > 0 && totalPayableToEmployee < recoveryLkr)) {
    return {
      ok: false,
      requiresFmPaymentConfirm: false,
      requiresDebtClearance: true,
      message: `Net balance owed to company (${formatSettlementAmount(Math.abs(netSettlementLkr))}). Recover all outstanding balances before HR confirms resignation.`,
    };
  }

  if (totalPayableToEmployee > 0 && !fmOffboardingPaymentConfirmed) {
    return {
      ok: false,
      requiresFmPaymentConfirm: true,
      requiresDebtClearance: false,
      message:
        netSettlementLkr > 0
          ? `Confirm final net payment of ${formatSettlementAmount(netSettlementLkr)} in this clearance screen before confirming resignation.`
          : 'Confirm final salary release (netted against recoveries) in this clearance screen before confirming resignation.',
    };
  }

  if (recoveryLkr > 0 && finalPayLkr === 0) {
    return {
      ok: false,
      requiresFmPaymentConfirm: false,
      requiresDebtClearance: true,
      message: `Outstanding balance of ${formatSettlementAmount(recoveryLkr)} must be settled before HR confirms resignation.`,
    };
  }

  return {
    ok: true,
    requiresFmPaymentConfirm: false,
    requiresDebtClearance: false,
    message: 'Ready for HR to confirm resignation.',
  };
}

function formatSettlementAmount(n: number) {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    maximumFractionDigits: 0,
  }).format(n);
}
