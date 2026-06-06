import DeductionsForm from './DeductionsForm';
import { listGuardsForDeductions } from '../actions/deductions';

export default async function DeductionsPage() {
  const guards = await listGuardsForDeductions();
  return <DeductionsForm guards={guards} />;
}
