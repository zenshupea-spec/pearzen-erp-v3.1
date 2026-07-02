import { Suspense } from 'react';

import { getPearzenWebsitePageData } from './actions';
import PearzenWebsiteShell from './components/PearzenWebsiteShell';
import { PearzenWebsiteProvider } from './components/PearzenWebsiteContext';
import PearzenWebsiteHome from './PearzenWebsiteHome';
import './pearzen-website-brand.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Pearzen Technologies — Software across markets',
  description:
    'Workforce and hospitality software, bespoke internal systems, client websites, and a consumer super-app — built by Pearzen Technologies.',
};

export default async function PearzenWebsitePage() {
  const { content, canEdit } = await getPearzenWebsitePageData();

  return (
    <Suspense fallback={null}>
      <PearzenWebsiteProvider content={content} canEdit={canEdit}>
        <PearzenWebsiteShell>
          <PearzenWebsiteHome />
        </PearzenWebsiteShell>
      </PearzenWebsiteProvider>
    </Suspense>
  );
}
