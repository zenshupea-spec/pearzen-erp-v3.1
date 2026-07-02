import type { ReactNode } from 'react';

import { ExecutiveBrandThemeProvider } from '../../components/executive/ExecutiveBrandTheme';
import StaffPortalChrome from '../../components/portal/StaffPortalChrome';
import { loadExecutiveBrandTokens } from '../../lib/cvs-brand-tokens-server';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const brandTokens = await loadExecutiveBrandTokens();

  return (
    <ExecutiveBrandThemeProvider initialTokens={brandTokens}>
      <StaffPortalChrome>{children}</StaffPortalChrome>
    </ExecutiveBrandThemeProvider>
  );
}
