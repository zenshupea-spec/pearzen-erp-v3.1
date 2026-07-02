import { PolicyDocument, SHALOM_RESIDENCE_POLICY_SITE } from '../../../../../packages/ecommerce-policies';

import { buildShalomPublicPageMetadata } from '../../../lib/shalom-public-seo';

export const metadata = buildShalomPublicPageMetadata({
  title: 'Refund Policy',
  description: `Refund and cancellation policy for ${SHALOM_RESIDENCE_POLICY_SITE.businessName} bookings.`,
  path: '/refund-policy',
});

export default function ShalomRefundPolicyPage() {
  return <PolicyDocument site={SHALOM_RESIDENCE_POLICY_SITE} kind="refund" embedded />;
}
