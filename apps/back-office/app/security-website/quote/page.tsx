import SecurityQuotePageClient from './SecurityQuoteClient';

export const metadata = {
  title: 'Get a Quote | Pearzen Security',
  description: 'Request a free site security assessment and tailored guard service proposal.',
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function QuotePage({ searchParams }: Props) {
  const params = await searchParams;
  const service = typeof params.service === 'string' ? params.service : undefined;
  const guards =
    typeof params.guards === 'string' ? parseInt(params.guards, 10) || undefined : undefined;
  const estimate =
    typeof params.estimate === 'string' ? parseFloat(params.estimate) || undefined : undefined;

  return (
    <SecurityQuotePageClient
      defaultService={service}
      defaultGuards={guards}
      defaultEstimate={estimate}
    />
  );
}
