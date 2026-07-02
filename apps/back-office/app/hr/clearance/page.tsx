import { redirect } from 'next/navigation';

/** Offboarding clearance is handled in MNR — keep old URL working. */
export default function ClearanceDeskPage() {
  redirect('/hr/mnr');
}
