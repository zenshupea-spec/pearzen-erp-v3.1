'use client';

import SecurityQuoteForm from '../components/SecurityQuoteForm';
import { useSecurityWebsite } from '../components/SecurityWebsiteContext';

type Props = {
  defaultService?: string;
  defaultGuards?: number;
  defaultEstimate?: number;
};

export default function SecurityQuotePageClient({
  defaultService,
  defaultGuards,
  defaultEstimate,
}: Props) {
  const { ui } = useSecurityWebsite();

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:px-6 md:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{ui.navQuote}</h1>
      <p className="mt-4 text-base text-slate-600">{ui.requestAssessment}</p>
      <div className="mt-10">
        <SecurityQuoteForm
          defaultService={defaultService}
          defaultGuards={defaultGuards}
          defaultEstimate={defaultEstimate}
        />
      </div>
    </div>
  );
}
