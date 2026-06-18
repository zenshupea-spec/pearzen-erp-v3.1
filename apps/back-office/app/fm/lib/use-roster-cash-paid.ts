'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '../../../../../packages/supabase/client';
import type { PayrollPeriod } from './payroll-period';
import {
  cashPaymentStatus,
  markCohortExportedRecord,
  readCohortExport,
  readEmployeeCashPaid,
  recordEmployeeCashPayment,
  revertCohortExportedRecord,
  revertEmployeeCashPaid,
  type CashPaidAuditEvent,
  type CashPaidRecord,
} from './roster-cash-paid-store';

export type { CashPaidAuditEvent, CashPaidRecord };

export function useRosterCashPaid(employeeId: string | null) {
  const [tick, setTick] = useState(0);
  const [actorLabel, setActorLabel] = useState('FM User');
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    setTick((value) => value + 1);
  }, [employeeId]);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled || !user) return;
      const metaName = user.user_metadata?.full_name;
      const label =
        (typeof metaName === 'string' && metaName.trim()) ||
        user.email?.split('@')[0] ||
        'FM User';
      setActorLabel(label);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const bump = useCallback(() => {
    setTick((value) => value + 1);
  }, []);

  const salaryRecord = useCallback(
    (period: PayrollPeriod, dueLkr?: number): CashPaidRecord => {
      if (!employeeId) return { amountPaidLkr: 0, dueLkr, events: [] };
      void tick;
      return readEmployeeCashPaid('salary', employeeId, period, dueLkr);
    },
    [employeeId, tick],
  );

  const advanceRecord = useCallback(
    (period: PayrollPeriod, dueLkr?: number): CashPaidRecord => {
      if (!employeeId) return { amountPaidLkr: 0, dueLkr, events: [] };
      void tick;
      return readEmployeeCashPaid('advance', employeeId, period, dueLkr);
    },
    [employeeId, tick],
  );

  const isSalaryCashPaid = useCallback(
    (period: PayrollPeriod, dueLkr = 0) =>
      cashPaymentStatus(salaryRecord(period, dueLkr), dueLkr) === 'paid',
    [salaryRecord],
  );

  const isAdvanceCashPaid = useCallback(
    (period: PayrollPeriod, dueLkr = 0) =>
      cashPaymentStatus(advanceRecord(period, dueLkr), dueLkr) === 'paid',
    [advanceRecord],
  );

  const salaryCashAudit = useCallback(
    (period: PayrollPeriod, dueLkr?: number): CashPaidAuditEvent[] =>
      salaryRecord(period, dueLkr).events,
    [salaryRecord],
  );

  const advanceCashAudit = useCallback(
    (period: PayrollPeriod, dueLkr?: number): CashPaidAuditEvent[] =>
      advanceRecord(period, dueLkr).events,
    [advanceRecord],
  );

  const recordSalaryCashPayment = useCallback(
    (period: PayrollPeriod, paymentLkr: number, dueLkr: number) => {
      if (!employeeId) return;
      recordEmployeeCashPayment('salary', employeeId, period, actorLabel, paymentLkr, dueLkr);
      bump();
    },
    [actorLabel, bump, employeeId],
  );

  const revertSalaryCashPaid = useCallback(
    (period: PayrollPeriod, dueLkr?: number) => {
      if (!employeeId) return;
      revertEmployeeCashPaid('salary', employeeId, period, actorLabel, dueLkr);
      bump();
    },
    [actorLabel, bump, employeeId],
  );

  const recordAdvanceCashPayment = useCallback(
    (period: PayrollPeriod, paymentLkr: number, dueLkr: number) => {
      if (!employeeId) return;
      recordEmployeeCashPayment('advance', employeeId, period, actorLabel, paymentLkr, dueLkr);
      bump();
    },
    [actorLabel, bump, employeeId],
  );

  const revertAdvanceCashPaid = useCallback(
    (period: PayrollPeriod, dueLkr?: number) => {
      if (!employeeId) return;
      revertEmployeeCashPaid('advance', employeeId, period, actorLabel, dueLkr);
      bump();
    },
    [actorLabel, bump, employeeId],
  );

  const markSalaryCashPaid = useCallback(
    (period: PayrollPeriod, dueLkr = 0) => {
      recordSalaryCashPayment(period, dueLkr, dueLkr);
    },
    [recordSalaryCashPayment],
  );

  const markAdvanceCashPaid = useCallback(
    (period: PayrollPeriod, dueLkr = 0) => {
      recordAdvanceCashPayment(period, dueLkr, dueLkr);
    },
    [recordAdvanceCashPayment],
  );

  const cohortRecord = useCallback(
    (payrollGroup: string, period: PayrollPeriod): CashPaidRecord => {
      void tick;
      return readCohortExport(payrollGroup, period);
    },
    [tick],
  );

  const isCohortExported = useCallback(
    (payrollGroup: string, period: PayrollPeriod) =>
      cohortRecord(payrollGroup, period).amountPaidLkr > 0,
    [cohortRecord],
  );

  const cohortExportAudit = useCallback(
    (payrollGroup: string, period: PayrollPeriod): CashPaidAuditEvent[] =>
      cohortRecord(payrollGroup, period).events,
    [cohortRecord],
  );

  const markCohortExported = useCallback(
    (payrollGroup: string, period: PayrollPeriod) => {
      markCohortExportedRecord(payrollGroup, period, actorLabel);
      bump();
    },
    [actorLabel, bump],
  );

  const revertCohortExported = useCallback(
    (payrollGroup: string, period: PayrollPeriod) => {
      revertCohortExportedRecord(payrollGroup, period, actorLabel);
      bump();
    },
    [actorLabel, bump],
  );

  return {
    salaryRecord,
    advanceRecord,
    isSalaryCashPaid,
    isAdvanceCashPaid,
    salaryCashAudit,
    advanceCashAudit,
    recordSalaryCashPayment,
    revertSalaryCashPaid,
    recordAdvanceCashPayment,
    revertAdvanceCashPaid,
    markSalaryCashPaid,
    markAdvanceCashPaid,
    isCohortExported,
    cohortExportAudit,
    markCohortExported,
    revertCohortExported,
  };
}
