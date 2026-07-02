'use client';

import { useCallback, useEffect, useState } from 'react';
import { getPayrollBatchStatus } from '../payroll-run-actions';
import { getFmRetentionEmpNumberSets } from './fm-retention-actions';
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
  const [stopListEmpNos, setStopListEmpNos] = useState<ReadonlySet<string>>(() => new Set());
  const [holdListEmpNos, setHoldListEmpNos] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      getPayrollBatchStatus(period.year, period.month),
      getFmRetentionEmpNumberSets(period),
    ]).then(([payload, retentionSets]) => {
      if (cancelled) return;
      const next = new Map<string, RosterSalaryStatusContext>();
      for (const run of payload.runs) {
        next.set(run.groupId, {
          period,
          payrollStatus: run.status,
          payrollPaidAt: run.paidAt,
          stopListEmpNos: retentionSets.stop,
          holdListEmpNos: retentionSets.hold,
        });
      }
      setPayrollRuns(next);
      setStopListEmpNos(retentionSets.stop);
      setHoldListEmpNos(retentionSets.hold);
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
      const context = {
        ...payrollRunContextForRow(row, period, payrollRuns),
        stopListEmpNos,
        holdListEmpNos,
      };
      return resolveRosterSalaryPaymentState(row, context);
    },
    [cashTick, holdListEmpNos, payrollRuns, period, stopListEmpNos],
  );

  return {
    loading,
    resolveStatus,
  };
}
