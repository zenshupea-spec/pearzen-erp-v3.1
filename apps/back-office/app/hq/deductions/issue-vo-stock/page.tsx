import {
  getUniformStockOverview,
  getUniformVoStockHolders,
} from '../actions';
import IssueVoStockWorkbench from './IssueVoStockWorkbench';

export const dynamic = 'force-dynamic';

export default async function IssueVoStockPage() {
  const [overview, { holders, isDemo: holdersDemo }] = await Promise.all([
    getUniformStockOverview(),
    getUniformVoStockHolders(),
  ]);

  return (
    <IssueVoStockWorkbench
      warehouseItems={overview.items}
      warehouseDemo={overview.isDemo}
      holders={holders}
      holdersDemo={holdersDemo}
    />
  );
}
