'use client';

import { parseEstimatorSearchParams } from '../../../lib/security-website-calculator';
import SecurityCostEstimator from '../components/SecurityCostEstimator';

type Props = {
  searchParams: Record<string, string | string[] | undefined>;
};

export default function SecurityPricingPage({ searchParams }: Props) {
  const initial = parseEstimatorSearchParams(searchParams);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
      <SecurityCostEstimator initial={initial} showEmailCapture />
    </div>
  );
}
