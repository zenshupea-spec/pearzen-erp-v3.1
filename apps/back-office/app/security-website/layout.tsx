import { Suspense } from 'react';

import { getSecurityWebsitePageData } from './actions';
import SecurityWebsiteShell from './components/SecurityWebsiteShell';
import { SecurityWebsiteProvider } from './components/SecurityWebsiteContext';
import './security-website-brand.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Classic Venture Security (Pvt) Ltd.',
  description:
    'GPS-verified security monitoring, supervisor audits, client portal, and trained manpower — island-wide since 2006.',
};

export default async function SecurityWebsiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { content, canEdit, guardRanks, quoteRecipientEmails } = await getSecurityWebsitePageData();

  return (
    <Suspense fallback={null}>
      <SecurityWebsiteProvider
        content={content}
        canEdit={canEdit}
        guardRanks={guardRanks}
        quoteRecipientEmails={quoteRecipientEmails}
      >
        <SecurityWebsiteShell>{children}</SecurityWebsiteShell>
      </SecurityWebsiteProvider>
    </Suspense>
  );
}
