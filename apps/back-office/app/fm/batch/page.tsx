import { redirect } from 'next/navigation';

/** Run Payroll merged into Payroll Ledger at /fm */
export default function FMBatchRedirectPage() {
  redirect('/fm');
}
