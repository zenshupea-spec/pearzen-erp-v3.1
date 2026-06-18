'use client';

import { useCallback, useEffect, useState } from 'react';
import { getPayrollBatchStatus } from '../payroll-run-actions';
import type { FmPayrollRosterRow } from './fm-payroll-roster-data';
import {
  payrollRunContextForRow,
  resolveRosterSalaryPaymentState,
  type RosterSalaryPaymentState,
  type RosterSalaryStatusContext,
} from './fm-roster-salary-status';
import type { PayrollPeriod } from './payroll-period';

export function useRosterSalaryStatus(period: PayrollPeriod) {
  const [loading, setLoading] = useState(true);
  const [cashTick, setCashTick] = useState(0);
  const [payrollRuns, setPayrollRuns] = useState<Map<string, RosterSalaryStatusContext>>(
    () => new Map(),
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getPayrollBatchStatus(period.year, period.month).then((payload) => {
      if (cancelled) return;
      const next = new Map<string, RosterSalaryStatusContext>();
      for (const run of payload.runs) {
        next.set(run.groupId, {
          period,
          payrollStatus: run.status,
          payrollPaidAt: run.paidAt,
        });
      }
      setPayrollRuns(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [period.year, period.month, period]);

  useEffect(() => {
    const bump = () => setCashTick((value) => value + 1);
    window.addEventListener('pearzen-fm-roster-cash-change', bump);
    return () => window.removeEventListener('pearzen-fm-roster-cash-change', bump);
  }, []);

  const resolveStatus = useCallback(
    (row: FmPayrollRosterRow): RosterSalaryPaymentState => {
      void cashTick;
      const context = payrollRunContextForRow(row, period, payrollRuns);
      return resolveRosterSalaryPaymentState(row, context);
    },
    [cashTick, payrollRuns, period],
  );

  return {
    loading,
    resolveStatus,
  };
}
