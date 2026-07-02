import type { ReactNode } from 'react';

import StaffPortalChrome from '../../components/portal/StaffPortalChrome';

export default function AccountLayout({ children }: { children: ReactNode }) {
  return <StaffPortalChrome>{children}</StaffPortalChrome>;
}
