import { PolicyDocument, SHALOM_RESIDENCE_POLICY_SITE } from '../../../../../packages/ecommerce-policies';

import { buildShalomPublicPageMetadata } from '../../../lib/shalom-public-seo';

export const metadata = buildShalomPublicPageMetadata({
  title: 'Privacy Policy',
  description: `Privacy policy for ${SHALOM_RESIDENCE_POLICY_SITE.businessName} direct bookings.`,
  path: '/privacy-policy',
});

export default function ShalomPrivacyPolicyPage() {
  return <PolicyDocument site={SHALOM_RESIDENCE_POLICY_SITE} kind="privacy" embedded />;
}
