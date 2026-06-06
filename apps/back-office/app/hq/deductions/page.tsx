import SiteDeductionsWorkbench from './SiteDeductionsWorkbench';
import { getSiteDeductionGroups } from './actions';

export const dynamic = 'force-dynamic';

export default async function DeductionsAdminPage() {
  const { groups, payrollMonth, isDemo } = await getSiteDeductionGroups();

  return (
    <SiteDeductionsWorkbench
      initialGroups={groups}
      initialPayrollMonth={payrollMonth}
      initialIsDemo={isDemo}
    />
  );
}
