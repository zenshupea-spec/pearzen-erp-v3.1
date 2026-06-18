import { redirect } from 'next/navigation';

/** Live guard schedule — legacy mock roster UI removed. */
export default function MobileRosterPage() {
  redirect('/dashboard/schedule');
}
