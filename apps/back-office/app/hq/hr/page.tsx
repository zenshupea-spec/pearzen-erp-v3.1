import { redirect } from 'next/navigation';

/** Legacy mock HR page — live roster is Master Nominal Roll. */
export default function HqHrRedirectPage() {
  redirect('/hr/mnr');
}
