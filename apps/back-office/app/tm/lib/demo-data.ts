export const TM_DEMO_NOTE =
  'Preview metrics are illustrative. Live sector manager names and site counts sync from HR when Supabase is connected.';

export type TmSmMetricSeed = {
  emp_number: string;
  shortage7DayAvg: number;
  activeDeficits: number;
  disciplinary30Day: number;
  visitCompliancePct: number;
};

/** Demo KPIs keyed by EPF when live rollups are not yet wired. */
export const TM_SM_METRIC_SEEDS: Record<string, TmSmMetricSeed> = {
  '1001': { emp_number: '1001', shortage7DayAvg: 2.3, activeDeficits: 3, disciplinary30Day: 1, visitCompliancePct: 88 },
  '1002': { emp_number: '1002', shortage7DayAvg: 0.8, activeDeficits: 1, disciplinary30Day: 2, visitCompliancePct: 94 },
  '1003': { emp_number: '1003', shortage7DayAvg: 1.4, activeDeficits: 2, disciplinary30Day: 0, visitCompliancePct: 91 },
};

export function demoMetricsForSm(empNumber: string, index: number): TmSmMetricSeed {
  const seed = TM_SM_METRIC_SEEDS[empNumber];
  if (seed) return seed;
  const wave = (index % 5) * 0.3;
  return {
    emp_number: empNumber,
    shortage7DayAvg: Number((1.2 + wave).toFixed(1)),
    activeDeficits: (index % 3) + 1,
    disciplinary30Day: index % 4,
    visitCompliancePct: 85 + (index % 10),
  };
}

export type TmEscalationRow = {
  id: string;
  title: string;
  site: string;
  smName: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  raisedAt: string;
  omAck: boolean;
};

export const TM_DEMO_ESCALATIONS: TmEscalationRow[] = [
  {
    id: 'ESC-2026-014',
    title: 'Repeated night-shift shorts — Western A',
    site: 'Lanka Hospitals',
    smName: 'SM Dissanayake',
    severity: 'HIGH',
    raisedAt: '2026-06-04T06:10:00Z',
    omAck: true,
  },
  {
    id: 'ESC-2026-011',
    title: 'SM visit cap breach (weekly)',
    site: 'Arpico Supercentre',
    smName: 'SM Perera',
    severity: 'MEDIUM',
    raisedAt: '2026-06-03T14:22:00Z',
    omAck: true,
  },
  {
    id: 'ESC-2026-009',
    title: 'Integrity queue — 45 min variance cluster',
    site: 'Dialog Axiata HQ',
    smName: 'SM Fernando',
    severity: 'HIGH',
    raisedAt: '2026-06-02T09:05:00Z',
    omAck: false,
  },
];
