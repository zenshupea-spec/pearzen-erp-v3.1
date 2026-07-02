import Link from 'next/link';
import { Suspense } from 'react';

import PortalLoadingScreen from '../../../../../packages/pwa-shell/PortalLoadingScreen';
import ForgeContactInboxClient from './ForgeContactInboxClient';

export default function ForgeContactInboxPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0e] text-slate-200 font-sans pb-20">
      <div className="bg-[#111118] border-b border-indigo-500/20 sticky top-0 z-50 px-6 py-5 flex justify-between items-center shadow-lg shadow-black/40">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight uppercase">Contact Inbox</h1>
          <p className="text-[10px] text-indigo-400 font-mono font-bold uppercase tracking-widest mt-1">
            info@pearzen.tech · linked to Commerce purchases
          </p>
        </div>
        <Link
          href="/forge"
          className="text-xs font-bold text-indigo-400 hover:text-white uppercase tracking-wider"
        >
          Back to Forge
        </Link>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <Suspense fallback={<PortalLoadingScreen accent="violet" variant="light" fullscreen={false} className="min-h-[16rem]" label="Loading inbox…" />}>
          <ForgeContactInboxClient />
        </Suspense>
      </div>
    </div>
  );
}
