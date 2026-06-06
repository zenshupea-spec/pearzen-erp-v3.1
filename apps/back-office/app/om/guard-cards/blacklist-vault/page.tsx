import { redirect } from 'next/navigation';

/** @deprecated Use /om/guard-cards/blacklisted */
export default function BlacklistVaultRedirectPage() {
  redirect('/om/guard-cards/blacklisted');
}
