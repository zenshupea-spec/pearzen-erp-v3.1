import Link from 'next/link';
import { cookies } from 'next/headers';
import { Home, KeyRound } from 'lucide-react';

import HrPortalPasswordResetNotice from '../../../components/hr/HrPortalPasswordResetNotice';
import HrHubPills from '../HrHubPills';
import { getActiveShalomStaff } from './actions';
import ShalomPortalClient from './ShalomPortalClient';

export const dynamic = 'force-dynamic';

const PROVISION_FLASH_COOKIE = 'shalom_portal_provision_flash';

export default async function ShalomPortalManagementPage() {
  const staff = await getActiveShalomStaff();

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
  }

  return (
    <div className="min-h-full">
      <div className="sticky top-0 z-30 border-b border-slate-200/80 bg-[#eef2f6]/95 shadow-sm backdrop-blur-md -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto max-w-[1800px] py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="rounded-xl border border-teal-200 bg-teal-50 p-2.5">
                <KeyRound className="h-6 w-6 text-teal-700" />
              </div>
              <div>
                <h1 className="text-xl font-black uppercase tracking-widest text-slate-900 md:text-2xl">
                  Shalom Front Office
                </h1>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  OTP for MD-assigned Shalom property caretakers — provision and PIN reset
                </p>
              </div>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition-all hover:border-[color:var(--cvs-accent-muted)] hover:bg-[var(--cvs-accent-soft)]/60 hover:text-[color:var(--cvs-accent)]"
            >
              <Home className="h-3.5 w-3.5" />
              HQ Hub
            </Link>
          </div>

          <HrHubPills />
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-6 py-6">
        <HrPortalPasswordResetNotice />
        <ShalomPortalClient staff={staff} initialOtp={initialOtp} />
      </div>
    </div>
  );
}
