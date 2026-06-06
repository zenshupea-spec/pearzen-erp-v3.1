import { getSiteMealAssignments } from '../actions';
import SiteMealSupplierWorkbench from './SiteMealSupplierWorkbench';

export const dynamic = 'force-dynamic';

export default async function SiteMealSuppliersPage() {
  const { rows, suppliers, isDemo } = await getSiteMealAssignments();

  return (
    <SiteMealSupplierWorkbench
      initialRows={rows}
      initialSuppliers={suppliers}
      initialIsDemo={isDemo}
    />
  );
}
