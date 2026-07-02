'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import HqHubShell from './HqHubShell';
import StaffPortalChrome from '../portal/StaffPortalChrome';

const STANDALONE_HQ_PATHS = ['/hq/audit'];

export default function HqLayoutShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const standalone = STANDALONE_HQ_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  if (standalone) {
    return (
      <StaffPortalChrome>
        <div className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</div>
      </StaffPortalChrome>
    );
  }

  return (
    <StaffPortalChrome>
      <HqHubShell>{children}</HqHubShell>
    </StaffPortalChrome>
  );
}
