import SecurityPricingPage from './SecurityPricingClient';

export const metadata = {
  title: 'Pricing & Cost Estimator | Pearzen Security',
  description: 'Get an indicative monthly estimate for guard services in Sri Lanka.',
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PricingPage({ searchParams }: Props) {
  const params = await searchParams;
  return <SecurityPricingPage searchParams={params} />;
}
