import Link from 'next/link';
import { redirect } from 'next/navigation';

import ForgeGateShell from '../../../../components/portal/ForgeGateShell';
import { getForgePortalAuthRecord } from '../../../../lib/forge-portal-auth';
import { getAuthenticatedForgeSession } from '../../../../lib/forge-portal-session';
import ForgeVerifyPinForm from './ForgeVerifyPinForm';

export default async function ForgeVerifyPinPage() {
  const session = await getAuthenticatedForgeSession();
  if (!('error' in session)) {
    const record = await getForgePortalAuthRecord(session.user.email);
    if (record?.needs_pin_setup || !record?.pin_hash) {
      redirect('/login/forge/set-pin');
    }
  }

  return (
    <ForgeGateShell
      title="Verify password"
      subtitle="Re-enter your Forge login password to continue."
    >
      <ForgeVerifyPinForm />
      <p className="mt-4 text-center text-xs text-slate-500">
        <Link href="/login/forge/forgot-password" className="text-indigo-300 hover:underline">
          Forgot password?
        </Link>
      </p>
    </ForgeGateShell>
  );
}
