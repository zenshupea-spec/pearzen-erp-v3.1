import { getSecurityWebsitePageData } from '../security-website/actions';
import SecurityWebsiteShell from '../security-website/components/SecurityWebsiteShell';
import { SecurityWebsiteProvider } from '../security-website/components/SecurityWebsiteContext';
import '../security-website/security-website-brand.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Client Portal — Classic Venture Security',
  description: 'Sign in to your Classic Venture Security site dashboard.',
};

export default async function ClientLoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { content, canEdit, guardRanks, quoteRecipientEmails } = await getSecurityWebsitePageData();

  return (
    <SecurityWebsiteProvider
      content={content}
      canEdit={canEdit}
      guardRanks={guardRanks}
      quoteRecipientEmails={quoteRecipientEmails}
    >
      <SecurityWebsiteShell>{children}</SecurityWebsiteShell>
    </SecurityWebsiteProvider>
  );
}
