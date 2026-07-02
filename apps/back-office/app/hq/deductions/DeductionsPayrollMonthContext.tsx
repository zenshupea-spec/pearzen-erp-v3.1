'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { payrollMonthFirstDay, payrollMonthLabel } from './lib/payroll-month';

type DeductionsPayrollMonthContextValue = {
  /** HTML month input value (YYYY-MM). */
  monthInput: string;
  setMonthInput: (value: string) => void;
  /** First day of payroll month (YYYY-MM-01). */
  payrollMonth: string;
  payrollMonthLabel: string;
};

const DeductionsPayrollMonthContext = createContext<DeductionsPayrollMonthContextValue | null>(
  null,
);

export function DeductionsPayrollMonthProvider({ children }: { children: ReactNode }) {
  const [monthInput, setMonthInput] = useState(() => payrollMonthFirstDay().slice(0, 7));

  const payrollMonth = payrollMonthFirstDay(monthInput);
  const label = payrollMonthLabel(payrollMonth);

  const value = useMemo(
    (): DeductionsPayrollMonthContextValue => ({
      monthInput,
      setMonthInput,
      payrollMonth,
      payrollMonthLabel: label,
    }),
    [label, monthInput, payrollMonth],
  );

  return (
    <DeductionsPayrollMonthContext.Provider value={value}>
      {children}
    </DeductionsPayrollMonthContext.Provider>
  );
}

export function useDeductionsPayrollMonth(): DeductionsPayrollMonthContextValue {
  const ctx = useContext(DeductionsPayrollMonthContext);
  if (!ctx) {
    throw new Error('useDeductionsPayrollMonth must be used within DeductionsPayrollMonthProvider');
  }
  return ctx;
}
