'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { ExecutivePageLoading } from '../../../components/executive/ExecutivePageChrome';
import { cafeComplianceSectionHref } from './cafe-portal-nav';

export function CafeComplianceSectionRedirect({
  anchor,
  message,
}: {
  anchor: string;
  message: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const hubView = searchParams.get('hub') === '1';
    const branchId = searchParams.get('branch');
    router.replace(cafeComplianceSectionHref(anchor, hubView, branchId));
  }, [anchor, router, searchParams]);

  return <ExecutivePageLoading message={message} />;
}
