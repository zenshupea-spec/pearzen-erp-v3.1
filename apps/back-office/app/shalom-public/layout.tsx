import { Suspense, type ReactNode } from 'react';
import { Cormorant_Garamond, DM_Sans } from 'next/font/google';

import { getShalomPublicWebsiteLayoutData } from '../../app/shalom-public/actions';
import ShalomPublicShell from '../../components/shalom-public/ShalomPublicShell';
import { ShalomPublicWebsiteProvider } from '../../components/shalom-public/ShalomPublicWebsiteContext';
import { shalomPublicRootMetadata } from '../../lib/shalom-public-seo';

export const metadata = shalomPublicRootMetadata;
export const dynamic = 'force-dynamic';

const shalomDisplay = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-shalom-display',
});

const shalomBody = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-shalom-body',
});

export default async function ShalomPublicLayout({ children }: { children: ReactNode }) {
  const layoutData = await getShalomPublicWebsiteLayoutData();

  return (
    <div className={`${shalomDisplay.variable} ${shalomBody.variable}`}>
      <Suspense fallback={null}>
        <ShalomPublicWebsiteProvider {...layoutData}>
          <ShalomPublicShell>{children}</ShalomPublicShell>
        </ShalomPublicWebsiteProvider>
      </Suspense>
    </div>
  );
}
