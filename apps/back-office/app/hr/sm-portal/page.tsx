import Link from 'next/link';
import { cookies } from 'next/headers';
import { Home, KeyRound } from 'lucide-react';
import HrHubPills from '../HrHubPills';
import { getActiveSectorManagers } from './actions';
import SMPortalClient from './SMPortalClient';

export const dynamic = 'force-dynamic';

const PROVISION_FLASH_COOKIE = 'sm_portal_provision_flash';

export default async function SMPortalManagementPage() {
  const managers = await getActiveSectorManagers();

  let initialOtp: { epf: string; otp: string; smName: string } | null = null;
  const jar = await cookies();
  const flash = jar.get(PROVISION_FLASH_COOKIE);
  if (flash?.value) {
    try {
      const parsed = JSON.parse(flash.value) as { epf?: string; otp?: string; smName?: string };
      if (parsed.epf && parsed.otp && parsed.smName) {
        initialOtp = { epf: parsed.epf, otp: parsed.otp, smName: parsed.smName };
      }
    } catch {
      /* ignore malformed flash */
    }
  }

  return (
    <div className="-mx-4 md:-mx-8 min-h-full">
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-xl border-b border-slate-200 shadow-sm">
        <div className="max-w-[1800px] mx-auto px-4 md:px-8 py-4">
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
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition-all hover:bg-slate-50"
            >
              <Home className="h-3.5 w-3.5" />
              HQ Hub
            </Link>
          </div>

          <HrHubPills />
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8">
        <SMPortalClient managers={managers} initialOtp={initialOtp} />
      </div>
    </div>
  );
}
