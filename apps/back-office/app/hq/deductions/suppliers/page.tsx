import { listMealSuppliers } from '../actions';
import MealSuppliersWorkbench from './MealSuppliersWorkbench';

export const dynamic = 'force-dynamic';

export default async function MealSuppliersPage() {
  const { suppliers, isDemo } = await listMealSuppliers(false);

  return <MealSuppliersWorkbench initialSuppliers={suppliers} initialIsDemo={isDemo} />;
}
