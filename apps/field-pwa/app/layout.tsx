import type { Metadata, Viewport } from 'next';
import './globals.css';
import GuardPortalShell from './components/GuardPortalShell';
import { getCompanyLogoUrl } from '../../../packages/supabase/company-branding';

export const metadata: Metadata = {
  title: 'Classic Venture — Guard Portal',
  description: 'Authorised guard check-in, geofence verification, and field reporting.',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const logoUrl = await getCompanyLogoUrl();

  return (
    <html lang="en">
      <body className="relative min-h-[100dvh] overflow-x-hidden bg-slate-300 font-sans text-slate-900 antialiased">
        <div className="relative z-10 mx-auto min-h-[100dvh] w-full max-w-md">
          <GuardPortalShell logoUrl={logoUrl}>{children}</GuardPortalShell>
        </div>
      </body>
    </html>
  );
}
