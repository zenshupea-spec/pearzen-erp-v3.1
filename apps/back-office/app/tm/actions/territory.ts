'use server';

import { getSectorManagersForAssignment } from '../../om/actions/sites';
import { demoMetricsForSm } from '../lib/demo-data';

export type TmSectorManagerRollup = {
  emp_number: string;
  full_name: string;
  site_count: number;
  shortage7DayAvg: number;
  activeDeficits: number;
  disciplinary30Day: number;
  visitCompliancePct: number;
};

export async function getTmSectorManagerRollup(): Promise<TmSectorManagerRollup[]> {
  const managers = await getSectorManagersForAssignment();

  return managers.map((m, index) => {
    const metrics = demoMetricsForSm(m.emp_number, index);
    return {
      emp_number: m.emp_number,
      full_name: m.full_name,
      site_count: m.site_count,
      shortage7DayAvg: metrics.shortage7DayAvg,
      activeDeficits: metrics.activeDeficits,
      disciplinary30Day: metrics.disciplinary30Day,
      visitCompliancePct: metrics.visitCompliancePct,
    };
  });
}
