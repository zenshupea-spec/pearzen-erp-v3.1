import Link from 'next/link';
import { cookies } from 'next/headers';
import { ArrowLeft, KeyRound } from 'lucide-react';

import HrPortalPasswordResetNotice from '../../../components/hr/HrPortalPasswordResetNotice';
import HrHubPills from '../HrHubPills';
import { getActiveCafeStaff } from './actions';
import CafePortalClient from './CafePortalClient';

export const dynamic = 'force-dynamic';

const PROVISION_FLASH_COOKIE = 'cafe_portal_provision_flash';

export default async function CafePortalManagementPage() {
  const staff = await getActiveCafeStaff();

  let initialOtp: { epf: string; otp: string; staffName: string } | null = null;
  let flashWarning: string | null = null;
  const jar = await cookies();
  const flash = jar.get(PROVISION_FLASH_COOKIE);
  if (flash?.value) {
    try {
      const parsed = JSON.parse(flash.value) as {
        epf?: string;
        otp?: string;
        staffName?: string;
        docWarning?: string;
        provisionWarning?: string;
      };
      if (parsed.epf && parsed.otp && parsed.staffName) {
        initialOtp = {
          epf: parsed.epf,
          otp: parsed.otp,
          staffName: parsed.staffName,
        };
      }
      const warning = parsed.provisionWarning?.trim() || parsed.docWarning?.trim();
      if (warning) {
        flashWarning = warning;
      }
    } catch {
      /* ignore malformed flash */
    }
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
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm transition-all hover:border-[color:var(--cvs-accent-muted)] hover:bg-[var(--cvs-accent-soft)]/60 hover:text-[color:var(--cvs-accent)]"
        >
          <ArrowLeft className="h-4 w-4" />
          HR Hub
        </Link>
      </header>

      <HrPortalPasswordResetNotice />

      {flashWarning ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
          {flashWarning}
        </div>
      ) : null}

      <CafePortalClient staff={staff} initialOtp={initialOtp} />
    </div>
  );
}
