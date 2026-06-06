import { redirect } from 'next/navigation';

/** Legacy mock finance page — live payroll is Finance Manager portal. */
export default function HqFinanceRedirectPage() {
  redirect('/fm');
}
