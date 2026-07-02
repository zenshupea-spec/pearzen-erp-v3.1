'use client';

import { Suspense, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import { buildShalomPublicNavItems } from '../../lib/shalom-public-path';
import { shalomPublicBodyClass, shalomPublicCssVars } from '../../lib/shalom-public-tokens';
import ShalomPublicFooter from './ShalomPublicFooter';
import ShalomPublicHeader from './ShalomPublicHeader';
import { useShalomPublicWebsite } from './ShalomPublicWebsiteContext';
import {
  ShalomPublicWebsiteEditBar,
  ShalomPublicWebsiteEditProvider,
} from './ShalomPublicWebsiteEditProvider';

function ShalomPublicShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { listings, canEdit } = useShalomPublicWebsite();
  const navItems = buildShalomPublicNavItems(listings, pathname);

  return (
    <div
      className={`shalom-public-root flex min-h-screen flex-col bg-[color:var(--shalom-bg)] text-[color:var(--shalom-text)] antialiased ${shalomPublicBodyClass}`}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `.shalom-public-root { ${shalomPublicCssVars} }`,
        }}
      />
      <ShalomPublicWebsiteEditBar />
      <ShalomPublicHeader navItems={navItems} offsetForEditBar={canEdit} />
      <main className="flex-1">{children}</main>
      <ShalomPublicFooter />
    </div>
  );
}

export default function ShalomPublicShell({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <ShalomPublicWebsiteEditProvider>
        <ShalomPublicShellInner>{children}</ShalomPublicShellInner>
      </ShalomPublicWebsiteEditProvider>
    </Suspense>
  );
}
