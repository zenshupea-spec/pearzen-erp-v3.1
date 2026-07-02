import { describe, expect, it } from 'vitest';

type GuardShiftRecord = {
  employeeId: string;
  siteProfileId: string | null;
  shiftDate: string;
};

function indexGuardShiftRecords(records: GuardShiftRecord[]) {
  const byEmployee = new Map<string, string[]>();
  const byEmployeeSite = new Map<string, string[]>();

  for (const record of records) {
    if (!record.shiftDate) continue;
    const empDates = byEmployee.get(record.employeeId) ?? [];
    empDates.push(record.shiftDate);
    byEmployee.set(record.employeeId, empDates);

    if (record.siteProfileId) {
      const siteKey = `${record.employeeId}:${record.siteProfileId}`;
      const siteDates = byEmployeeSite.get(siteKey) ?? [];
      siteDates.push(record.shiftDate);
      byEmployeeSite.set(siteKey, siteDates);
    }
  }

  return { byEmployee, byEmployeeSite };
}

function guardShiftDatesForEmployee(
  records: GuardShiftRecord[],
  employeeId: string,
  siteId?: string,
): string[] {
  return records
    .filter((record) => {
      if (record.employeeId !== employeeId) return false;
      if (siteId && record.siteProfileId !== siteId) return false;
      return Boolean(record.shiftDate);
    })
    .map((record) => record.shiftDate);
}

function guardShiftDatesFromIndex(
  index: ReturnType<typeof indexGuardShiftRecords>,
  employeeId: string,
  siteId?: string,
): string[] {
  if (siteId) {
    return index.byEmployeeSite.get(`${employeeId}:${siteId}`) ?? [];
  }
  return index.byEmployee.get(employeeId) ?? [];
}

describe('FM portfolio shift index (step 13 regression)', () => {
  const records: GuardShiftRecord[] = [
    { employeeId: 'g1', siteProfileId: 's1', shiftDate: '2026-07-01' },
    { employeeId: 'g1', siteProfileId: 's1', shiftDate: '2026-07-02' },
    { employeeId: 'g1', siteProfileId: 's2', shiftDate: '2026-07-03' },
    { employeeId: 'g2', siteProfileId: 's1', shiftDate: '2026-07-04' },
  ];

  const index = indexGuardShiftRecords(records);

  it('matches legacy filter for employee-wide shift dates', () => {
    expect(guardShiftDatesFromIndex(index, 'g1')).toEqual(guardShiftDatesForEmployee(records, 'g1'));
    expect(guardShiftDatesFromIndex(index, 'g2')).toEqual(guardShiftDatesForEmployee(records, 'g2'));
  });

  it('matches legacy filter for site-scoped shift dates', () => {
    expect(guardShiftDatesFromIndex(index, 'g1', 's1')).toEqual(
      guardShiftDatesForEmployee(records, 'g1', 's1'),
    );
    expect(guardShiftDatesFromIndex(index, 'g1', 's2')).toEqual(
      guardShiftDatesForEmployee(records, 'g1', 's2'),
    );
  });
});
