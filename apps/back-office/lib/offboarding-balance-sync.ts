import type { UnsettledBalanceLine } from './employee-clearance-ledger';

export type EmployeeOffboardingBalances = {
  uniformBalance: number;
  accomBalance: number;
};

/** Map clearance recovery lines to `employees.uniform_balance` / `accom_balance` (R-FIN-05). */
export function computeOffboardingBalanceColumns(
  lines: Pick<UnsettledBalanceLine, 'type' | 'amountLkr'>[],
): EmployeeOffboardingBalances {
  let uniformBalance = 0;
  let accomBalance = 0;

  for (const line of lines) {
    const amount = Math.max(0, Number(line.amountLkr) || 0);
    if (amount <= 0) continue;
    if (line.type === 'uniform') {
      uniformBalance += amount;
    } else {
      accomBalance += amount;
    }
  }

  return { uniformBalance, accomBalance };
}

export function persistedOffboardingBalanceLines(
  uniformBalance: number,
  accomBalance: number,
): UnsettledBalanceLine[] {
  const lines: UnsettledBalanceLine[] = [];
  const uniform = Math.max(0, Number(uniformBalance) || 0);
  const accom = Math.max(0, Number(accomBalance) || 0);

  if (uniform > 0) {
    lines.push({
      type: 'uniform',
      label: 'Uniform recovery',
      amountLkr: uniform,
      detail: 'Synced from employee record',
      source: 'database',
    });
  }
  if (accom > 0) {
    lines.push({
      type: 'advance',
      label: 'Meals / advance / other',
      amountLkr: accom,
      detail: 'Synced from employee record',
      source: 'database',
    });
  }

  return lines;
}
