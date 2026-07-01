import { PolicyDocument, SHALOM_RESIDENCE_POLICY_SITE } from '../../../../../packages/ecommerce-policies';

export const metadata = {
  title: 'Privacy Policy — Shalom Residence',
  description: 'Privacy policy for Shalom Residence bookings',
};

export default function ShalomPrivacyPolicyPage() {
  return (
    <PolicyDocument
      site={SHALOM_RESIDENCE_POLICY_SITE}
      kind="privacy"
      homeHref="/"
      accentClass="text-teal-800"
      accentBorderClass="border-teal-200"
      accentBgClass="bg-teal-50"
    />
  );
}
