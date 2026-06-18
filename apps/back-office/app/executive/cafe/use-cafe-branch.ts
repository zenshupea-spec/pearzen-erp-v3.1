'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { listCafeBranches, type CafeBranch } from './actions';

export function useCafeBranchScope(pathname: string) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromHub = searchParams.get('hub') === '1';
  const branchParam = searchParams.get('branch');
  const [branches, setBranches] = useState<CafeBranch[]>([]);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [locationName, setLocationName] = useState<string | null>(null);

  useEffect(() => {
    void listCafeBranches().then(({ branches: list }) => {
      setBranches(list);
      const resolved =
        branchParam && list.some((branch) => branch.id === branchParam)
          ? branchParam
          : list[0]?.id ?? null;
      setLocationId(resolved);
    });
  }, [branchParam]);

  const handleBranchChange = useCallback(
    (branchId: string) => {
      setLocationId(branchId);
      const params = new URLSearchParams(searchParams.toString());
      params.set('branch', branchId);
      if (fromHub) params.set('hub', '1');
      router.replace(`${pathname}?${params.toString()}`);
    },
    [fromHub, pathname, router, searchParams],
  );

  return {
    branches,
    locationId,
    locationName,
    setLocationName,
    fromHub,
    handleBranchChange,
  };
}
