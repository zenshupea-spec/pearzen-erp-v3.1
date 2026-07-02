import { redirect } from 'next/navigation';

/** Legacy bulk export — bank files must come from MD-approved payslips on /fm. */
export default function BulkBankExportPage() {
  redirect('/fm');
}
