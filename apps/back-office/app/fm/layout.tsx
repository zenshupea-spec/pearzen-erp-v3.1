import type React from 'react';

import SaasPaymentNoticeBanner from '../../components/billing/SaasPaymentNoticeBanner';
import { ExecutiveBrandThemeProvider } from '../../components/executive/ExecutiveBrandTheme';
import StaffPortalChrome from '../../components/portal/StaffPortalChrome';
import { loadExecutiveBrandTokens } from '../../lib/cvs-brand-tokens-server';

export default async function FmLayout({ children }: { children: React.ReactNode }) {
  const brandTokens = await loadExecutiveBrandTokens();

  return (
    <ExecutiveBrandThemeProvider initialTokens={brandTokens}>
      <SaasPaymentNoticeBanner />
      <StaffPortalChrome />
      {/* FM routes use light slate UI; root body is zinc-950 dark — shell avoids invisible text. */}
      <div className="min-h-screen bg-slate-50 text-slate-900">{children}</div>
    </ExecutiveBrandThemeProvider>
  );
}
