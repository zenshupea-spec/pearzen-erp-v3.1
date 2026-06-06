import Link from 'next/link';
import { ArrowLeft, Shirt } from 'lucide-react';
import UniformIssuePage from '../../../components/uniform-issue/UniformIssuePage';

export const dynamic = 'force-dynamic';

export default function TmUniformIssuePage() {
  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <div className="relative z-10 mx-auto w-full min-w-0 max-w-7xl px-3 py-6 sm:px-4 sm:py-8 md:px-6">
        <Link
          href="/tm"
          className="mb-5 inline-flex max-w-full items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-800 sm:mb-6 sm:text-xs"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <span className="truncate">Return to TM command center</span>
        </Link>

        <header className="mb-6 flex items-start gap-3 border-b border-slate-200 pb-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-200 bg-violet-50">
            <Shirt className="h-5 w-5 text-violet-700" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-600">
              TM Command Center
            </p>
            <h1 className="text-xl font-black uppercase tracking-tight text-slate-900 sm:text-2xl">
              Uniform issue
            </h1>
          </div>
        </header>

        <UniformIssuePage
          portal="TM"
          backHref="/tm"
          backLabel="Back to TM command center"
          portalTitle="TM Command Center"
        />
      </div>
    </main>
  );
}
