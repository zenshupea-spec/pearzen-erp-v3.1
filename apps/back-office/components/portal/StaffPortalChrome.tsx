'use client';

import type { ReactNode } from 'react';

import PortalSessionProvider from './PortalSessionProvider';

export default function StaffPortalChrome({ children }: { children?: ReactNode }) {
  return <PortalSessionProvider>{children}</PortalSessionProvider>;
}
