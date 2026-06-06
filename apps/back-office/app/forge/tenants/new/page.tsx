import { redirect } from 'next/navigation';

export default function LegacyNewTenantRedirect() {
  redirect('/forge/companies/new');
}
