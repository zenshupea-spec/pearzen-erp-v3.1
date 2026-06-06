import { redirect } from 'next/navigation';

/** HQ home — same portal nexus as /dashboard (executive sidebar HQ Hub target). */
export default function HqHomeRedirect() {
  redirect('/dashboard');
}
