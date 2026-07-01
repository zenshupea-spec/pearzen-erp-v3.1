import { PolicyDocument, SHALOM_RESIDENCE_POLICY_SITE } from '../../../../../packages/ecommerce-policies';

export const metadata = {
  title: 'Terms and Conditions — Shalom Residence',
  description: 'Terms and conditions for Shalom Residence bookings',
};

export default function ShalomTermsPage() {
  return (
    <PolicyDocument
      site={SHALOM_RESIDENCE_POLICY_SITE}
      kind="terms"
      homeHref="/"
      accentClass="text-teal-800"
      accentBorderClass="border-teal-200"
      accentBgClass="bg-teal-50"
    />
  );
}
