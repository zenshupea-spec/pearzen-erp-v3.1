import type { ReactNode } from 'react';

import PartnerPortalChrome from '../../components/portal/PartnerPortalChrome';

export default function PartnersLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0a0e] text-slate-200 font-sans">
      <main className="mx-auto max-w-6xl px-6 py-8 pb-20">
        <PartnerPortalChrome />
        {children}
      </main>
    </div>
  );
}
