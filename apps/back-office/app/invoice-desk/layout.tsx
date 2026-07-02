import type { ReactNode } from 'react';

import { ExecutiveBrandThemeProvider } from '../../components/executive/ExecutiveBrandTheme';
import { InvoiceDeskShell } from '../../components/invoice-desk/InvoiceDeskShell';
import { loadExecutiveBrandTokens } from '../../lib/cvs-brand-tokens-server';

export default async function InvoiceDeskLayout({ children }: { children: ReactNode }) {
  const brandTokens = await loadExecutiveBrandTokens();

  return (
    <ExecutiveBrandThemeProvider initialTokens={brandTokens}>
      <InvoiceDeskShell>{children}</InvoiceDeskShell>
    </ExecutiveBrandThemeProvider>
  );
}
