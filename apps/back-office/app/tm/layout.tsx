import type { ReactNode } from 'react';

import StaffPortalChrome from '../../components/portal/StaffPortalChrome';

export default function TmLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <StaffPortalChrome />
      {children}
    </>
  );
}
