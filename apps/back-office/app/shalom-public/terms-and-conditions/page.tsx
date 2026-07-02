import { PolicyDocument, SHALOM_RESIDENCE_POLICY_SITE } from '../../../../../packages/ecommerce-policies';

import { buildShalomPublicPageMetadata } from '../../../lib/shalom-public-seo';

export const metadata = buildShalomPublicPageMetadata({
  title: 'Terms and Conditions',
  description: `Terms and conditions for ${SHALOM_RESIDENCE_POLICY_SITE.businessName} direct bookings.`,
  path: '/terms-and-conditions',
});

export default function ShalomTermsPage() {
  return <PolicyDocument site={SHALOM_RESIDENCE_POLICY_SITE} kind="terms" embedded />;
}
