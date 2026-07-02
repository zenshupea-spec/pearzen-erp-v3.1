import Link from 'next/link';
import { Home, KeyRound } from 'lucide-react';

import HrPortalPasswordResetNotice from '../../../components/hr/HrPortalPasswordResetNotice';
import HrHubPills from '../HrHubPills';
import { getHeadOfficePortalStaff } from './actions';
import HeadOfficePortalClient from './HeadOfficePortalClient';

export const dynamic = 'force-dynamic';

export default async function HeadOfficePortalManagementPage() {
  const staff = await getHeadOfficePortalStaff();

  return (
    <div className="min-h-full">
      <div className="sticky top-0 z-30 border-b border-slate-200/80 bg-[#eef2f6]/95 shadow-sm backdrop-blur-md -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto max-w-[1800px] py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="rounded-xl border border-violet-200 bg-violet-50 p-2.5">
                <KeyRound className="h-6 w-6 text-violet-700" />
              </div>
              <div>
                <h1 className="text-xl font-black uppercase tracking-widest text-slate-900 md:text-2xl">
                  HQ Portal Access
                </h1>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  Head Office OTP — FM, EA, OM, and TM
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
        <HeadOfficePortalClient staff={staff} />
      </div>
    </div>
  );
}
