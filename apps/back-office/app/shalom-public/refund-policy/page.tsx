import { PolicyDocument, SHALOM_RESIDENCE_POLICY_SITE } from '../../../../../packages/ecommerce-policies';

export const metadata = {
  title: 'Refund Policy — Shalom Residence',
  description: 'Refund and cancellation policy for Shalom Residence bookings',
};

export default function ShalomRefundPolicyPage() {
  return (
    <PolicyDocument
      site={SHALOM_RESIDENCE_POLICY_SITE}
      kind="refund"
      homeHref="/"
      accentClass="text-teal-800"
      accentBorderClass="border-teal-200"
      accentBgClass="bg-teal-50"
    />
  );
}
