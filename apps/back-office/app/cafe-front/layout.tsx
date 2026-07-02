import type { ReactNode } from 'react';

import { ExecutiveBrandThemeProvider } from '../../components/executive/ExecutiveBrandTheme';
import { loadExecutiveBrandTokens } from '../../lib/cvs-brand-tokens-server';
import CafeFrontDeviceFrame from './CafeFrontDeviceFrame';

export default async function CafeFrontLayout({ children }: { children: ReactNode }) {
  const brandTokens = await loadExecutiveBrandTokens();

  return (
    <ExecutiveBrandThemeProvider initialTokens={brandTokens}>
      <CafeFrontDeviceFrame>{children}</CafeFrontDeviceFrame>
    </ExecutiveBrandThemeProvider>
  );
}
