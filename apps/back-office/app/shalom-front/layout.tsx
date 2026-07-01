import type { ReactNode } from 'react';

import { ExecutiveBrandThemeProvider } from '../../components/executive/ExecutiveBrandTheme';
import { loadExecutiveBrandTokens } from '../../lib/cvs-brand-tokens-server';
import CafeFrontDeviceFrame from '../cafe-front/CafeFrontDeviceFrame';

export default async function ShalomFrontLayout({ children }: { children: ReactNode }) {
  const brandTokens = await loadExecutiveBrandTokens();

  return (
    <ExecutiveBrandThemeProvider initialTokens={brandTokens}>
      <CafeFrontDeviceFrame>{children}</CafeFrontDeviceFrame>
    </ExecutiveBrandThemeProvider>
  );
}
