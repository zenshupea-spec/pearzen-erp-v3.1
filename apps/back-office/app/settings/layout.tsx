import type { ReactNode } from 'react';

import StaffPortalChrome from '../../components/portal/StaffPortalChrome';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <StaffPortalChrome />
      <main className="mx-auto max-w-5xl px-6 py-8 pb-20">{children}</main>
    </div>
  );
}
