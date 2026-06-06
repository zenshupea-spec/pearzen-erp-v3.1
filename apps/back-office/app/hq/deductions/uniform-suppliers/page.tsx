import { getUniformStockOverview, getUniformVoStockHolders } from '../actions';
import UniformSuppliersWorkbench from './UniformSuppliersWorkbench';

export const dynamic = 'force-dynamic';

export default async function UniformSuppliersPage() {
  const [overview, { holders }] = await Promise.all([
    getUniformStockOverview(),
    getUniformVoStockHolders(),
  ]);

  return <UniformSuppliersWorkbench initial={overview} holders={holders} />;
}
