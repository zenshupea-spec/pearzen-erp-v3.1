import { redirect } from 'next/navigation';

/** Orphan HR ledger retired — salary advances run on the FM Advance desk. */
export default function HrAdvancesRedirectPage() {
  redirect('/fm/advance');
}
