import type { ReactNode } from 'react';

import { ExecutiveBrandThemeProvider } from '../../components/executive/ExecutiveBrandTheme';
import StaffPortalChrome from '../../components/portal/StaffPortalChrome';
import { loadExecutiveBrandTokens } from '../../lib/cvs-brand-tokens-server';
import { OmFieldDataProvider } from './context/OmFieldDataContext';

export default async function OmLayout({ children }: { children: ReactNode }) {
  const brandTokens = await loadExecutiveBrandTokens();

  return (
    <ExecutiveBrandThemeProvider initialTokens={brandTokens}>
      <OmFieldDataProvider>
        <StaffPortalChrome />
        {children}
      </OmFieldDataProvider>
    </ExecutiveBrandThemeProvider>
  );
}
