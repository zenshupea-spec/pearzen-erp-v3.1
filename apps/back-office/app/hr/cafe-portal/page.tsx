import Link from 'next/link';
import { cookies } from 'next/headers';
import { ArrowLeft, KeyRound } from 'lucide-react';

import HrHubPills from '../HrHubPills';
import { getActiveCafeStaff } from './actions';
import CafePortalClient from './CafePortalClient';

export const dynamic = 'force-dynamic';

const PROVISION_FLASH_COOKIE = 'cafe_portal_provision_flash';

export default async function CafePortalManagementPage() {
  const staff = await getActiveCafeStaff();

  let initialOtp: { epf: string; otp: string; staffName: string } | null = null;
  const jar = await cookies();
  const flash = jar.get(PROVISION_FLASH_COOKIE);
  if (flash?.value) {
    try {
      const parsed = JSON.parse(flash.value) as {
        epf?: string;
        otp?: string;
        staffName?: string;
      };
      if (parsed.epf && parsed.otp && parsed.staffName) {
        initialOtp = {
          epf: parsed.epf,
          otp: parsed.otp,
          staffName: parsed.staffName,
        };
      }
    } catch {
      /* ignore malformed flash */
    }
    jar.set(PROVISION_FLASH_COOKIE, '', { maxAge: 0, path: '/' });
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <HrHubPills />
      <header className="flex items-center justify-between border-b border-slate-200 pb-5">
        <div className="flex items-center gap-4">
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
            <KeyRound className="h-7 w-7 text-orange-600" />
          </div>
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900">
              Café Front Access
            </h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              First-time access and PIN reset via one-time password
            </p>
          </div>
        </div>
        <Link
          href="/hr/mnr"
          className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          HR Hub
        </Link>
      </header>

      <CafePortalClient staff={staff} initialOtp={initialOtp} />
    </div>
  );
}
