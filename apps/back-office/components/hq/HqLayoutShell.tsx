'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import HqHubShell from './HqHubShell';

const STANDALONE_HQ_PATHS = ['/hq/audit'];

export default function HqLayoutShell({
  children,
  profileName,
  profileRank,
}: {
  children: ReactNode;
  profileName: string;
  profileRank: string;
}) {
  const pathname = usePathname();
  const standalone = STANDALONE_HQ_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  if (standalone) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </div>
    );
  }

  return (
    <HqHubShell profileName={profileName} profileRank={profileRank}>
      {children}
    </HqHubShell>
  );
}
