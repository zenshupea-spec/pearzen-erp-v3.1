import Link from 'next/link';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { getActiveSectorManagers } from '../../hr/sm-portal/actions';
import SMPortalClient from '../../hr/sm-portal/SMPortalClient';

export const dynamic = 'force-dynamic';

export default async function HQSMProxyPage() {
  const managers = await getActiveSectorManagers();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 py-2">
      <header className="flex items-center justify-between border-b border-slate-200 pb-5">
        <div className="flex items-center gap-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <KeyRound className="w-7 h-7 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900">
              SM Portal Access
            </h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              First-time access and PIN reset via one-time password
            </p>
          </div>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50"
        >
          <ArrowLeft className="w-4 h-4" />
          HQ Hub
        </Link>
      </header>

      <SMPortalClient managers={managers} />
    </div>
  );
}
