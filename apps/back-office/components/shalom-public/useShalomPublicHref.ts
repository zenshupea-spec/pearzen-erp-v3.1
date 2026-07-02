'use client';

import { useCallback } from 'react';
import { usePathname } from 'next/navigation';

import { shalomPublicHref } from '../../lib/shalom-public-path';

export function useShalomPublicHref() {
  const pathname = usePathname();

  return useCallback((path = '/') => shalomPublicHref(path, pathname), [pathname]);
}
