import type { Metadata, Viewport } from 'next';
import './globals.css';
import SMPortalShell from './components/SMPortalShell';
import { getCompanyLogoUrl } from '../../../packages/supabase/company-branding';

export const metadata: Metadata = {
  title: 'Pearzen SM Portal',
  description: 'Sector Manager Command Centre',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SM Portal',
  },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const logoUrl = await getCompanyLogoUrl();

  return (
    <html lang="en">
      <body className="relative min-h-[100dvh] overflow-x-hidden bg-slate-300 font-sans text-slate-900 antialiased">
        <div className="relative z-10 mx-auto min-h-[100dvh] w-full max-w-md">
          <SMPortalShell logoUrl={logoUrl}>{children}</SMPortalShell>
        </div>
      </body>
    </html>
  );
}
