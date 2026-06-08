import type React from 'react';

import SaasPaymentNoticeBanner from '../../components/billing/SaasPaymentNoticeBanner';

export default function FmLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SaasPaymentNoticeBanner />
      {children}
    </>
  );
}
