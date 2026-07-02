import type { ReactNode } from 'react';

import ForgePortalChrome from '../../components/portal/ForgePortalChrome';
import ForgePortalShell from './components/ForgePortalShell';

export default function ForgeLayout({ children }: { children: ReactNode }) {
  return (
    <ForgePortalShell>
      <ForgePortalChrome />
      {children}
    </ForgePortalShell>
  );
}
