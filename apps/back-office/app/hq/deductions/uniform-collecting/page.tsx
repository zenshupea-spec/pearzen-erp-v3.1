import { getUniformCollectionQueue } from '../actions';
import { payrollMonthFirstDay } from '../lib/payroll-month';
import UniformCollectingWorkbench from './UniformCollectingWorkbench';

export const dynamic = 'force-dynamic';

export default async function UniformCollectingPage() {
  const queue = await getUniformCollectionQueue(payrollMonthFirstDay());
  return <UniformCollectingWorkbench initial={queue} />;
}
