import Link from 'next/link';
import { ArrowLeft, MapPin } from 'lucide-react';
import TmSubnav from '../../../tm/components/TmSubnav';
import {
  getSitesNeedingGpsCapture,
  getSitesWithGpsConfigured,
} from '../../actions/sites';
import SiteLocationWorkbench from './SiteLocationWorkbench';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  title: 'Site GPS Configuration | TM Portal',
};

export default async function OmSiteLocationPage() {
  const [livePending, liveConfigured] = await Promise.all([
    getSitesNeedingGpsCapture(),
    getSitesWithGpsConfigured(),
  ]);
  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <div className="mx-auto w-full min-w-0 max-w-6xl px-3 py-6 sm:px-4 sm:py-8 md:px-6">
        <Link
          href="/dashboard"
          className="mb-5 inline-flex max-w-full items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-800 sm:mb-6 sm:text-xs"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <span className="truncate">Return to HQ Hub</span>
        </Link>

        <header className="mb-5 border-b border-slate-200 pb-5 sm:mb-6 sm:pb-6">
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50">
              <MapPin className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-black uppercase tracking-tight text-slate-900 sm:text-2xl">
                Site location configuration
              </h1>
              <p className="text-xs font-medium text-slate-500 sm:text-sm">
                Set or update GPS coordinates and geofence radius for field check-in
              </p>
            </div>
          </div>
        </header>

        <TmSubnav />

        <SiteLocationWorkbench
          initialPending={livePending}
          initialConfigured={liveConfigured}
          isDemo={false}
        />
      </div>
    </main>
  );
}
