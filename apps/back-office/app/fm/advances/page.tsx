import { redirect } from 'next/navigation';

/** Orphan MD list merged into FM Advance desk at /fm/advance (MD review at /executive/advance). */
export default function FmAdvancesRedirectPage() {
  redirect('/fm/advance');
}
