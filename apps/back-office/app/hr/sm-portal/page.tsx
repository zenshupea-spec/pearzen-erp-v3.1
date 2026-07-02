import Link from 'next/link';
import { cookies } from 'next/headers';
import { Home, KeyRound } from 'lucide-react';
import HrPortalPasswordResetNotice from '../../../components/hr/HrPortalPasswordResetNotice';
import HrHubPills from '../HrHubPills';
import { getActiveSectorManagers } from './actions';
import SMPortalClient from './SMPortalClient';

export const dynamic = 'force-dynamic';

const PROVISION_FLASH_COOKIE = 'sm_portal_provision_flash';

export default async function SMPortalManagementPage() {
  const managers = await getActiveSectorManagers();

  let initialOtp: { epf: string; otp: string; smName: string } | null = null;
  let flashWarning: string | null = null;
  const jar = await cookies();
  const flash = jar.get(PROVISION_FLASH_COOKIE);
  if (flash?.value) {
    try {
      const parsed = JSON.parse(flash.value) as {
        epf?: string;
        otp?: string;
        smName?: string;
        docWarning?: string;
        provisionWarning?: string;
      };
      if (parsed.epf && parsed.otp && parsed.smName) {
        initialOtp = { epf: parsed.epf, otp: parsed.otp, smName: parsed.smName };
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
    <div className="min-h-full">
      <div className="sticky top-0 z-30 border-b border-slate-200/80 bg-[#eef2f6]/95 backdrop-blur-md shadow-sm -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="max-w-[1800px] mx-auto py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5">
                <KeyRound className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-black uppercase tracking-widest text-slate-900">
                  SM Portal Access
                </h1>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  First-time access and PIN reset via one-time password
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

      <div className="mx-auto max-w-3xl py-6 space-y-6">
        <HrPortalPasswordResetNotice />
        {flashWarning ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
            {flashWarning}
          </div>
        ) : null}
        <SMPortalClient managers={managers} initialOtp={initialOtp} />
      </div>
    </div>
  );
}
