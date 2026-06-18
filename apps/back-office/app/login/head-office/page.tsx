import { redirect } from 'next/navigation';

/** Legacy URL — HQ staff use /login/hq; gateway at /login lists all four portals. */
export default function LegacyHeadOfficeLoginPage() {
  redirect('/login/hq');
}
